"""
Lumen - 知识库存储服务
管理源文件、切分、向量化、搜索
单个 TriviumDB 实例 + category 字段区分不同来源
"""

import json
import hashlib
import os
import time
import random
import string
import logging
import threading
from typing import Optional

import triviumdb

from lumen.config import (
    KNOWLEDGE_DB_PATH,
    AGENT_KNOWLEDGE_DB_PATH,
    KNOWLEDGE_CHUNK_SIZE,
    KNOWLEDGE_CHUNK_OVERLAP,
    KNOWLEDGE_SOURCE_DIR,
    KNOWLEDGE_SENTENCE_DB_PATH,
    KNOWLEDGE_SENTENCE_LEVEL,
    KNOWLEDGE_SENTENCE_TOP_N,
    KNOWLEDGE_SENTENCE_WINDOW,
    SPARSE_EMBEDDING_ENABLED,
    KNOWLEDGE_RERANK_ENABLED,
    KNOWLEDGE_RERANK_TOP_K,
    KNOWLEDGE_RERANK_MIN_SCORE,
    KNOWLEDGE_LIB_DIR,
)
from lumen.services.search.embedding import get_service as get_embedding_service
from lumen.services.knowledge.chunker import chunk_text, split_sentences
from lumen.services.knowledge import chunks as knowledge_chunks
from lumen.services.memory import active_store

logger = logging.getLogger(__name__)

# ── 最后一次搜索的元数据（供调用方读取各路径命中数和方法）──
_last_search_meta: dict = {}

def get_last_search_meta() -> dict:
    """返回最近一次 knowledge.search() 的元数据（副本）"""
    return _last_search_meta.copy()

# TDB 实例管理已迁移到 lumen/services/tdb_registry.py
# 调用 get_tdb("knowledge") / get_tdb("agent_knowledge") / get_tdb("knowledge_sentences")

from lumen.services.tdb_registry import get_tdb

# ── 参数化辅助函数（通用管道）──

def _get_db_for(kb_name: str) -> triviumdb.TriviumDB:
    """根据 kb_name 获取对应的 TDB 实例"""
    return get_tdb(kb_name)

def _get_sentence_db_for(kb_name: str) -> triviumdb.TriviumDB:
    """根据 kb_name 获取对应的句子 TDB 实例"""
    from lumen.services.knowledge.manifest import load_kb_manifest
    manifest = load_kb_manifest(kb_name)
    path = manifest.get("sentence_path") if manifest else None
    if path:
        basename = os.path.splitext(os.path.basename(path))[0]
        return get_tdb(basename)
    return get_tdb("knowledge_sentences")

def _get_source_dir_for(kb_name: str) -> str:
    """获取 kb_name 对应的源文件目录"""
    return os.path.join(KNOWLEDGE_LIB_DIR, kb_name)

# ── Registry 缓存（按 kb_name 隔离）──
_registry_caches: dict[str, dict[str, dict]] = {}
_registry_lock = threading.Lock()

MANIFEST_PATH = os.path.join(KNOWLEDGE_SOURCE_DIR, "_manifest.json")

def _manifest_path_for(kb_name: str) -> str:
    """获取 kb_name 对应的 manifest 路径"""
    if kb_name == "knowledge":
        return MANIFEST_PATH
    return os.path.join(KNOWLEDGE_LIB_DIR, kb_name, "_manifest.json")

def _prf_refine(db, query_vector: list[float], hits: list[dict],
                alpha: float, beta: float) -> list[float] | None:
    """PRF 精炼查询向量（委托给 vector_store.prf_refine）"""
    from lumen.services.search.vector_store import prf_refine
    return prf_refine(db, query_vector, hits, alpha, beta)

def _index_chunk_text(db, node_id: int, chunk: str, filename: str,
                      folder: str, tags: list = None) -> None:
    """为 chunk 建立 TriviumDB 文本索引（BM25 + AC 关键词 + 语义组联动）"""
    try:
        # BM25 全文索引（TriviumDB 2-Gram，语言无关，不需要 jieba）
        db.index_text(node_id, chunk)

        # AC 自动机关键词：文件名（带/不带扩展名）+ 文件夹路径
        if filename:
            db.index_keyword(node_id, filename)
            name_no_ext = os.path.splitext(filename)[0]
            if name_no_ext and name_no_ext != filename:
                db.index_keyword(node_id, name_no_ext)
        if folder:
            db.index_keyword(node_id, folder)

        # AC 自动机关键词：语义组联动（仅 topic 类型，emotion 用于评分不参与召回）
        try:
            from lumen.services.semantic_group import match_groups, get_group
            matched = match_groups(chunk, group_type="topic")
            for group_id in matched:
                g = get_group(group_id)
                if not g:
                    continue
                kws = json.loads(g["keywords"]) if isinstance(g["keywords"], str) else g["keywords"]
                for kw in kws:
                    db.index_keyword(node_id, kw)
                # 注册组名本身作为关键词
                if g.get("name"):
                    db.index_keyword(node_id, g["name"])
        except Exception:
            pass

        # AC 自动机关键词：payload tags
        if tags:
            for tag in tags:
                if tag:
                    db.index_keyword(node_id, tag)
    except Exception as e:
        logger.debug(f"TriviumDB 文本索引失败 (node {node_id}): {e}")

def _enrich_sparse_content(db, sparse_hits: list[dict]):
    """从 TriviumDB 补充稀疏搜索结果的 content 字段

    sparse_store 只存索引不存原文，需要从 TriviumDB 读回。
    """
    for hit in sparse_hits:
        if hit.get("content"):
            continue
        # 通过 file_id + chunk_index 在 TriviumDB 中找原文
        fid = hit.get("file_id", "")
        ci = hit.get("chunk_index", 0)
        if not fid:
            continue
        try:
            nodes = db.tql(f'FIND {{file_id: {json.dumps(fid)}}} RETURN *')
            for node in nodes:
                n = node.row.get("_", {})
                payload = n.get("payload", {})
                if payload.get("chunk_index") == ci:
                    hit["content"] = payload.get("content", "")
                    hit["source_path"] = payload.get("source_path", "")
                    hit["filename"] = payload.get("filename", "")
                    break
        except Exception:
            continue

def _vector_search(db, search_vector, query_text, top_k, min_score,
                   payload_filter=None):
    """向量搜索调度：advanced > hybrid > 纯向量，逐级回退

    返回 (results, method_used)
    """
    from lumen.config import SEARCH_USE_ADVANCED, SEARCH_USE_HYBRID, HYBRID_ALPHA, SEARCH_ADVANCED_TEXT_BOOST

    if SEARCH_USE_ADVANCED:
        try:
            return db.search_advanced(
                search_vector, top_k=top_k, expand_depth=0, min_score=min_score,
                teleport_alpha=0.5,
                enable_advanced_pipeline=True,
                enable_sparse_residual=True,
                fista_lambda=0.1,
                fista_threshold=0.3,
                enable_dpp=True,
                dpp_quality_weight=1.0,
                enable_refractory_fatigue=True,
                enable_text_hybrid_search=True,
                text_boost=SEARCH_ADVANCED_TEXT_BOOST,
                custom_query_text=query_text,
                payload_filter=payload_filter,
            ), "advanced"
        except Exception as e:
            logger.debug(f"search_advanced 失败，回退: {e}")

    if SEARCH_USE_HYBRID:
        try:
            return db.search_hybrid(
                search_vector, query_text, top_k=top_k, expand_depth=0,
                min_score=min_score, hybrid_alpha=HYBRID_ALPHA,
                payload_filter=payload_filter,
            ), "hybrid"
        except Exception as e:
            logger.debug(f"search_hybrid 失败，回退: {e}")

    return db.search(search_vector, top_k=top_k, min_score=min_score,
                     payload_filter=payload_filter), "vector"

async def search_diagnostics(query: str, top_k: int = 10) -> dict:
    """独立诊断接口：返回 TriviumDB 管线各阶段耗时

    供前端监控面板调用的独立 API，与主搜索解耦。
    使用 search_with_context 抓取 Rust 层真实计时。
    """
    backend = await get_embedding_service("knowledge")
    query_vector = await backend.encode(query) if backend else None
    if not query_vector:
        return {"error": "embedding unavailable"}

    db = _get_db_for("knowledge")
    try:
        hits, ctx = db.search_with_context(query_vector, top_k=top_k, min_score=0.3)
    except Exception as e:
        return {"error": f"search_with_context failed: {e}"}

    return {
        "result_count": len(hits),
        "timings": ctx.timings if hasattr(ctx, "timings") else {},
        "custom_data": ctx.custom_data if hasattr(ctx, "custom_data") else {},
    }

def _rrf_merge(
    vector_hits: list[dict],
    bm25_hits: list[dict],
    graph_hits: list[dict] | None = None,
    top_k: int = 5,
    vector_weight: float = 0.4,
    bm25_weight: float = 0.3,
    graph_weight: float = 0.3,
    k: int = 60,
) -> list[dict]:
    """RRF (Reciprocal Rank Fusion) 合并向量、BM25 和 图谱 结果

    公式: rrf_score = Σ (weight / (k + rank))
    每条结果按 (file_id, chunk_index) 去重（图谱用 entity_id）。
    """
    scores: dict[tuple, float] = {}
    content_map: dict[tuple, dict] = {}

    # 向量路径
    for rank, hit in enumerate(vector_hits):
        key = (hit.get("file_id", ""), hit.get("chunk_index", 0))
        scores[key] = scores.get(key, 0.0) + vector_weight / (k + rank + 1)
        if key not in content_map:
            content_map[key] = hit

    # BM25 路径
    for rank, hit in enumerate(bm25_hits):
        key = (hit.get("file_id", ""), hit.get("chunk_index", 0))
        scores[key] = scores.get(key, 0.0) + bm25_weight / (k + rank + 1)
        if key not in content_map:
            content_map[key] = {
                "file_id": hit.get("file_id", ""),
                "source_path": hit.get("source_path", ""),
                "filename": hit.get("filename", ""),
                "content": hit.get("content", ""),
                "chunk_index": hit.get("chunk_index", 0),
                "score": 0.0,
            }

    # T19 图谱路径
    if graph_hits:
        for rank, hit in enumerate(graph_hits):
            eid = hit.get("entity_id", 0)
            key = (f"graph:{eid}", rank)
            scores[key] = scores.get(key, 0.0) + graph_weight / (k + rank + 1)
            if key not in content_map:
                content_map[key] = {
                    "file_id": f"graph_{eid}",
                    "source_path": "",
                    "filename": "图谱召回",
                    "content": hit.get("content", ""),
                    "chunk_index": rank,
                    "score": hit.get("score", 0.0),
                    "entity_id": eid,
                }

    # 按 RRF 分数排序
    sorted_keys = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    result = []
    for key in sorted_keys[:top_k]:
        entry = content_map[key].copy()
        entry["rrf_score"] = scores[key]
        result.append(entry)

    return result

def _load_registry(kb_name: str = "knowledge") -> dict[str, dict]:
    """加载 registry（从 manifest 的 files 字段，带内存缓存）"""
    if kb_name in _registry_caches:
        return _registry_caches[kb_name]
    path = _manifest_path_for(kb_name)
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                _registry_caches[kb_name] = manifest.get("files", {})
            return _registry_caches[kb_name]
    except (json.JSONDecodeError, IOError):
        pass
    _registry_caches[kb_name] = {}
    return _registry_caches[kb_name]

def _save_registry(registry: dict[str, dict], kb_name: str = "knowledge") -> None:
    """保存 registry（写回 manifest 的 files 字段）并刷新缓存"""
    path = _manifest_path_for(kb_name)
    manifest = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    manifest["files"] = registry
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    _registry_caches[kb_name] = registry

def _clear_registry_cache(kb_name: str = None) -> None:
    """清 registry 缓存（kb_name=None 时清全部）"""
    if kb_name is None:
        _registry_caches.clear()
    else:
        _registry_caches.pop(kb_name, None)

def _generate_file_id() -> str:
    """生成文件ID: kb{timestamp6}{random3}"""
    timestamp = str(int(time.time()))[-6:]
    random_chars = "".join(random.choices(string.ascii_lowercase, k=3))
    return f"kb{timestamp}{random_chars}"

def _compute_md5(text: str) -> str:
    """计算文本内容 MD5"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()

def _read_file_content(path: str) -> str | None:
    """读取文件内容，自动尝试 UTF-8 和 GBK 编码"""
    for enc in ("utf-8", "gbk", "utf-8-sig"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
        except Exception:
            return None
    return None

# ── 公开 API ──

def list_files(category: str = None, kb_name: str = "knowledge") -> list[dict]:
    """列出所有已导入的文件元数据，可按 category 过滤"""
    registry = _load_registry(kb_name)
    entries = list(registry.values())
    if category:
        entries = [e for e in entries if e.get("category") == category]
    return sorted(entries, key=lambda e: e.get("created_at", ""), reverse=True)

def get_file(file_id: str, kb_name: str = "knowledge") -> Dict:
    """获取单个文件的元数据"""
    registry = _load_registry(kb_name)
    if file_id not in registry:
        raise FileNotFoundError(f"文件不存在: {file_id}")
    return registry[file_id]

async def import_file(
    filename: str,
    content: str,
    category: str = "imports",
    subdir: str = "",
    source: str = "upload",
    kb_name: str = "knowledge",
) -> Dict:
    """导入文件: 保存源文件 → 切分 → 批量嵌入 → 存入 knowledge.tdb

    Args:
        filename: 原始文件名
        content: 文件正文
        category: 分类（imports/notes/rpg/public）
        subdir: 子目录（如 "世界观/地理"）

    Returns:
        文件元数据 dict
    """
    fid = _generate_file_id()
    now = time.strftime("%Y-%m-%dT%H:%M:%S")

    # 1. 保存源文件（保留目录结构）
    _source_base = _get_source_dir_for(kb_name)
    if subdir:
        source_dir = os.path.join(_source_base, category, subdir)
    else:
        source_dir = os.path.join(_source_base, category)
    os.makedirs(source_dir, exist_ok=True)
    source_path = os.path.join(source_dir, filename)
    with open(source_path, "w", encoding="utf-8") as f:
        f.write(content)

    # 2. 切分
    chunks = chunk_text(content, KNOWLEDGE_CHUNK_SIZE, KNOWLEDGE_CHUNK_OVERLAP)
    if not chunks:
        chunks = [content] if content.strip() else []

    if not chunks:
        # 空内容，只保存源文件不向量化
        meta = _build_meta(fid, filename, category, subdir, 0, len(content), now, content)
        _update_registry(fid, meta, kb_name)
        logger.info(f"知识库导入（空内容）: {fid} ({filename})")
        return meta

    # 3. 批量嵌入（尝试同时获取稠密+稀疏向量）
    backend = await get_embedding_service(kb_name)

    sparse_vectors = None
    vectors = None

    if SPARSE_EMBEDDING_ENABLED and hasattr(backend, 'encode_batch_with_sparse'):
        try:
            sparse_result = await backend.encode_batch_with_sparse(
                chunks, instruction_type="document"
            )
            if sparse_result:
                vectors = [r[0] for r in sparse_result]
                sparse_vectors = [r[1] for r in sparse_result]
        except Exception as e:
            logger.warning(f"稀疏向量编码失败，回退纯稠密: {e}")

    if not vectors:
        vectors = await backend.encode_batch(chunks) if backend else None
    if not vectors:
        raise RuntimeError("Embedding 服务不可用，无法向量化")

    # 4. 存入 TriviumDB
    db = _get_db_for(kb_name)
    rel_path = os.path.join(category, subdir, filename) if subdir else os.path.join(category, filename)
    rel_path = rel_path.replace("\\", "/")

    node_ids = []
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        payload = {
            "file_id": fid,
            "source_path": rel_path,
            "filename": filename,
            "category": category,
            "source": source,
            "chunk_index": i,
            "content": chunk,
            "tags": [],
            "folder": subdir,
        }
        nid = db.insert(vector, payload)
        node_ids.append(nid)
        _index_chunk_text(db, nid, chunk, filename, subdir)
    db.flush()
    try:
        db.build_text_index()
    except Exception as e:
        logger.debug(f"build_text_index 失败 ({fid}): {e}")

    # 4.1 存入稀疏向量（如果获取成功）
    if sparse_vectors:
        try:
            from lumen.services.search.sparse_store import save_sparse_batch
            items = []
            for i, sv in enumerate(sparse_vectors):
                if sv:
                    items.append({
                        "node_id": node_ids[i],
                        "file_id": fid,
                        "chunk_index": i,
                        "category": category,
                        "sparse_data": sv,
                        "kb_name": kb_name,
                    })
            if items:
                save_sparse_batch(items)
        except Exception as e:
            logger.warning(f"稀疏向量存储失败 ({fid}): {e}")

    # T19: 图谱抽取（异步，不阻塞）
    async def _graph_extract_task():
        try:
            from lumen.services.graph import extract_and_store
            result = await extract_and_store(
                content=content, tdb_name=kb_name,
                source_path=subdir or category,
                source_doc_id=fid,
                source_type="file_chunk",
            )
            if result:
                logger.info(f"图谱抽取完成 (fid={fid}): {result}")
            else:
                logger.warning(f"图谱抽取无结果 (fid={fid})")
        except Exception as e:
            logger.error(f"图谱抽取失败 (fid={fid}): {e}", exc_info=True)

    try:
        import asyncio as _asyncio
        _asyncio.create_task(_graph_extract_task())
    except Exception as e:
        logger.warning(f"图谱抽取任务创建失败 (fid={fid}): {e}")

    # 4.5 写入 BM25 索引（FTS5 + jieba 分词）
    try:
        knowledge_chunks.save_knowledge_chunks_batch(fid, rel_path, filename, category, chunks, kb_name=kb_name)
    except Exception as e:
        logger.warning(f"知识库 BM25 索引写入失败 ({fid}): {e}")

    # 5. 句子级向量化（小模型，独立 TDB）
    sentence_backend = await get_embedding_service("knowledge_sentences")
    if sentence_backend:
        sdb = _get_sentence_db_for(kb_name)
        total_sentences = 0
        for i, chunk in enumerate(chunks):
            sentences = split_sentences(chunk)
            if not sentences:
                continue
            sentence_vectors = await sentence_backend.encode_batch(sentences)
            if not sentence_vectors:
                continue
            for j, (sent, svec) in enumerate(zip(sentences, sentence_vectors)):
                sdb.insert(svec, {
                    "file_id": fid,
                    "source_path": rel_path,
                    "category": category,
                    "chunk_index": i,
                    "sentence_index": j,
                    "content": sent,
                })
                total_sentences += 1
        if total_sentences:
            sdb.flush()
            logger.info(f"句子级向量化: {fid}, {total_sentences} 句")

    # 5. 更新 registry
    meta = _build_meta(fid, filename, category, subdir, len(chunks), len(content), now, content)
    _update_registry(fid, meta, kb_name)

    logger.info(f"知识库导入: {fid} ({filename}), {len(chunks)} chunks")
    return meta

async def refine_with_sentences(
    query: str,
    top_chunks: list[dict],
    kb_name: str = "knowledge",
) -> list[dict]:
    """在 top chunks 内做句子级精排 + 窗口展开

    流程：
    1. 用句子模型编码 query（与句子向量同一空间）
    2. 从 sentence_db 取出 top chunks 的所有句子（按 file_id + chunk_index 过滤）
    3. In-memory cosine similarity → top N 句子
    4. 窗口展开（±KNOWLEDGE_SENTENCE_WINDOW 句）
    5. 去重 + 按原文顺序排列
    """
    import numpy as np

    if not top_chunks:
        return []

    # 用句子嵌入服务编码 query（确保与句子向量同一空间，避免维度/空间不匹配）
    sentence_backend = await get_embedding_service("knowledge_sentences")
    if not sentence_backend:
        return top_chunks
    query_vector = await sentence_backend.encode(query)
    if not query_vector:
        return top_chunks

    sdb = _get_sentence_db_for(kb_name)

    # 收集 top chunks 的 (file_id, chunk_index) 集合
    target_chunks = set()
    for chunk in top_chunks:
        fid = chunk.get("file_id", "")
        ci = chunk.get("chunk_index", 0)
        if fid:
            target_chunks.add((fid, ci))

    if not target_chunks:
        return top_chunks

    # 取出所有相关句子（逐文件过滤，内存中二次过滤）
    # 直接从节点读取已存向量，不做重复编码
    all_sentences = []
    file_ids = {fid for fid, _ in target_chunks}
    for fid in file_ids:
        try:
            nodes = sdb.tql(f'FIND {{file_id: {json.dumps(fid)}}} RETURN *')
            for node in nodes:
                n = node.row.get("_", {})
                payload = n.get("payload", {})
                ci = payload.get("chunk_index", 0)
                if (fid, ci) not in target_chunks:
                    continue
                all_sentences.append({
                    "content": payload.get("content", ""),
                    "file_id": fid,
                    "chunk_index": ci,
                    "sentence_index": payload.get("sentence_index", 0),
                    "source_path": payload.get("source_path", ""),
                    "filename": payload.get("filename", ""),
                    "category": payload.get("category", ""),
                    "vector": n.get("vector"),
                })
        except Exception as e:
            logger.warning(f"句子级过滤失败 ({fid}): {e}")
            continue

    if not all_sentences:
        return top_chunks

    # 按 (chunk_index, sentence_index) 排序，方便后续窗口展开
    all_sentences.sort(key=lambda s: (s["chunk_index"], s["sentence_index"]))

    # In-memory cosine similarity（query 和句子向量都来自同一句子模型）
    query_arr = np.array(query_vector, dtype=np.float32)
    query_norm = np.linalg.norm(query_arr)
    if query_norm == 0:
        return top_chunks
    query_arr = query_arr / query_norm

    scored = []
    for sent in all_sentences:
        vec = sent.pop("vector", None)
        if not vec:
            continue
        arr = np.array(vec, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm == 0:
            continue
        score = float(np.dot(query_arr, arr / norm))
        sent["score"] = score
        scored.append(sent)

    if not scored:
        return top_chunks

    # Top N 句子
    scored.sort(key=lambda s: s["score"], reverse=True)
    top_n = scored[:KNOWLEDGE_SENTENCE_TOP_N]

    # 窗口展开：每个命中句子 ± window 句
    window = KNOWLEDGE_SENTENCE_WINDOW
    expanded_indices = set()
    # 建立 (chunk_index, sentence_index) → 在 all_sentences 中的位置 映射
    idx_map = {}
    for pos, s in enumerate(all_sentences):
        key = (s["chunk_index"], s["sentence_index"])
        idx_map[key] = pos

    for hit in top_n:
        ci = hit["chunk_index"]
        si = hit["sentence_index"]
        for delta in range(-window, window + 1):
            target_si = si + delta
            key = (ci, target_si)
            if key in idx_map:
                expanded_indices.add(idx_map[key])

    # 按原文顺序排列展开后的句子
    expanded = [all_sentences[pos] for pos in sorted(expanded_indices)]

    # 合并相邻句子为连续文本段落（同一 chunk 内连续 sentence_index）
    if not expanded:
        return top_chunks

    merged = []
    current_chunk = expanded[0]["chunk_index"]
    current_si = expanded[0]["sentence_index"]
    current_texts = [expanded[0]["content"]]
    current_score = expanded[0].get("score", 0.0)
    current_source = expanded[0].get("source_path", "")
    current_filename = expanded[0].get("filename", "")

    for sent in expanded[1:]:
        if sent["chunk_index"] == current_chunk and \
           sent["sentence_index"] == current_si + 1:
            # 同一 chunk 内连续句子，合并
            current_texts.append(sent["content"])
            current_score = max(current_score, sent.get("score", 0.0))
            current_si = sent["sentence_index"]
        else:
            # 断开，保存当前段落
            merged.append({
                "content": "".join(current_texts),
                "source_path": current_source,
                "filename": current_filename,
                "score": current_score,
            })
            current_chunk = sent["chunk_index"]
            current_si = sent["sentence_index"]
            current_texts = [sent["content"]]
            current_score = sent.get("score", 0.0)
            current_source = sent.get("source_path", "")
            current_filename = sent.get("filename", "")

    # 最后一段
    if current_texts:
        merged.append({
            "content": "".join(current_texts),
            "source_path": current_source,
            "filename": current_filename,
            "score": current_score,
        })

    return merged if merged else top_chunks

async def search(
    query: str,
    top_k: int = 5,
    min_score: float = 0.3,
    category: str = None,
    character_id: str = None,
    kb_name: str = "knowledge",
    access_filter: dict = None,
) -> list[dict]:
    """混合搜索: 向量+文本 + API稀疏 + 图谱 → 三路 RRF 合并 → PRF 精炼 → 句子级精排

    Args:
        query: 搜索文本
        top_k: 返回条数
        min_score: 最低相似度
        category: 按分类过滤
        character_id: 角色 ID，用于 ACL 前置过滤
        kb_name: 知识库名称（对应 TDB 实例），默认 "knowledge"
        access_filter: 访问控制过滤，格式 {"owner_id": "xxx", "access_list": [...]}
    """
    from lumen.config import PRF_ENABLED, PRF_ALPHA, PRF_BETA
    import time as _time
    _t0 = _time.time()

    backend = await get_embedding_service(kb_name)
    query_vector = await backend.encode(query) if backend else None
    if not query_vector:
        return []

    # ── T26: Topic 语义组搜索偏置 ──
    search_vector = query_vector
    try:
        from lumen.services.semantic_group import match_groups, enhance_query
        activated = match_groups(query, group_type="topic")
        if activated:
            active_ids = list(activated.keys())
            logger.debug(f"语义组激活: {activated}")
            search_vector = await enhance_query(query_vector, active_ids)
    except Exception as e:
        logger.debug(f"语义组偏置跳过: {e}")

    db = _get_db_for(kb_name)

    # ── ACL 前置过滤：展开为叶子文件夹精确列表 ──
    payload_filter = None
    allowed = []
    if character_id:
        try:
            from lumen.services.access_control import get_instance
            acl = get_instance()
            all_folders = _get_all_folders(db)
            allowed = acl.get_allowed_folders(character_id, "knowledge", kb_name, all_folders)

            if len(allowed) == len(all_folders):
                payload_filter = None
            elif len(allowed) == 0:
                payload_filter = {"folder": {"$in": ["__BLOCK_ALL__"]}}
            else:
                payload_filter = {"folder": {"$in": allowed}}
        except Exception as e:
            logger.warning(f"ACL 前置过滤失败，搜索无权限检查继续: {e}")

    # ── Path A: 向量+文本搜索（advanced > hybrid > 纯向量逐级回退）──
    results, search_method = _vector_search(
        db, search_vector, query, top_k * 3, min_score, payload_filter)
    vector_hits = []
    seen = set()
    for hit in results:
        payload = hit.payload if hasattr(hit, "payload") else {}
        if category and payload.get("category") != category:
            continue
        key = (payload.get("file_id", ""), payload.get("chunk_index", 0))
        if key in seen:
            continue
        seen.add(key)
        vector_hits.append({
            "chunk_id": hit.id if hasattr(hit, "id") else 0,
            "file_id": payload.get("file_id", ""),
            "source_path": payload.get("source_path", ""),
            "filename": payload.get("filename", ""),
            "content": payload.get("content", ""),
            "score": hit.score if hasattr(hit, "score") else 0.0,
            "chunk_index": payload.get("chunk_index", 0),
        })
        if len(vector_hits) >= top_k:
            break

    # ── Path B: 稀疏向量搜索（fallback 到 BM25）──
    bm25_hits = []
    sparse_used = False

    if SPARSE_EMBEDDING_ENABLED and hasattr(backend, 'encode_with_sparse'):
        try:
            from lumen.services.search.sparse_store import has_sparse_data, search_sparse
            if has_sparse_data():
                sparse_result = await backend.encode_with_sparse(
                    query, instruction_type="query"
                )
                if sparse_result:
                    _, query_sparse = sparse_result
                    bm25_hits = search_sparse(query_sparse, category or "", top_k, kb_name=kb_name)
                    sparse_used = True
                    # 补充 TriviumDB 中的 content（sparse_store 只存索引不存原文）
                    if bm25_hits:
                        _enrich_sparse_content(db, bm25_hits)
        except Exception as e:
            logger.debug(f"稀疏向量搜索失败: {e}")

    if not sparse_used:
        try:
            import jieba
            keywords = [w for w in jieba.cut(query) if len(w.strip()) > 1]
            if keywords:
                bm25_hits = knowledge_chunks.search_knowledge_bm25(
                    keywords, category=category or "", limit=top_k, kb_name=kb_name
                )
                # 主动记忆（daily_note）也走 BM25，合并到同一路径进 RRF
                if kb_name == "knowledge" and (not category or category.startswith("active")):
                    active_hits = []
                    for kw in keywords:
                        active_hits.extend(
                            active_store.search_active_memories_bm25(kw, limit=top_k)
                        )
                    # 去重
                    seen_bm25 = {(h.get("file_id", ""), h.get("chunk_index", 0)) for h in bm25_hits}
                    for ah in active_hits:
                        key = (ah.get("memory_id", ""), 0)
                        if key not in seen_bm25:
                            bm25_hits.append({
                                "file_id": ah.get("memory_id", ""),
                                "source_path": "",
                                "filename": "",
                                "category": f"active_{ah.get('category', 'context')}",
                                "chunk_index": 0,
                                "content": ah.get("content", ""),
                                "bm25_score": ah.get("bm25_score", 0.0),
                            })
                            seen_bm25.add(key)
        except Exception as e:
            logger.debug(f"知识库 BM25 搜索跳过: {e}")

    # ── Path C: 图谱召回（ACL 过滤）──
    graph_hits = []
    try:
        from lumen.config import GRAPH_RECALL_TOP_K
        # 直接搜索边节点 + ACL 过滤
        # 边节点有 fact_embedding（向量）和 source_path（ACL 依据）
        # ACL 逻辑：
        #   - payload_filter=None → 全部允许（角色有权访问所有文件夹）
        #   - payload_filter={"folder":...} → 有限权限，构建图谱 ACL 过滤
        #   - 无 character_id → 不过滤（管理后台等场景）
        graph_acl_filter = None
        if character_id and payload_filter is not None:
            # payload_filter 非空意味着 ACL 限制了部分文件夹
            # 构建边节点专用过滤：source_path 匹配允许的文件夹
            # allowed 是上面 ACL 计算的文件夹列表
            # 将文件夹路径映射为 source_path 前缀匹配列表
            # 注：边节点 source_path 格式为 "category/folder/file.txt"
            #     而 allowed 是纯 folder 路径（不含 category 前缀）
            #     因此需要补全为完整 source_path 前缀
            source_path_prefixes = list(allowed)
            if source_path_prefixes:
                graph_acl_filter = {
                    "type": "edge",
                    "source_path": {"$in": source_path_prefixes},
                    "invalid_at": None,
                }
        elif character_id and payload_filter is None:
            # ACL 允许所有文件夹，只过滤边节点类型
            graph_acl_filter = {
                "type": "edge",
                "invalid_at": None,
            }
        # else: 无 character_id → graph_acl_filter 保持 None（不过滤）
        # 注：当 allowed=[] 时，source_path_prefixes 为空，graph_acl_filter 保持 None，
        #     加上 character_id 存在，下面的条件不满足，图谱搜索自动跳过（正确行为）

        if graph_acl_filter is not None or not character_id:
            # 有 ACL 过滤条件或无 character_id → 执行搜索
            from lumen.services.graph.search import search_graph
            # source_path_prefixes 只在部分 ACL 分支定义，统一安全取值
            _folders = source_path_prefixes if "source_path_prefixes" in dir() else list(allowed)
            graph_hits = await search_graph(
                query_vector, query, tdb_name=kb_name,
                top_k=GRAPH_RECALL_TOP_K, acl_filter=graph_acl_filter,
                allowed_folders=_folders, character_id=character_id,
            )
    except Exception as e:
        logger.debug(f"图谱召回跳过: {e}")

    # ── 记录搜索元数据（先于 PRF 和句子级精排）──
    global _last_search_meta
    _last_search_meta = {
        "kb_name": kb_name,
        "search_method": search_method,
        "elapsed_ms": round((_time.time() - _t0) * 1000, 1),
        "vector_count": len(vector_hits),
        "sparse_count": len(bm25_hits) if sparse_used else 0,
        "bm25_count": 0 if sparse_used else len(bm25_hits),
        "graph_count": len(graph_hits),
        "bm25_method": "sparse" if sparse_used else "bm25",
    }

    # ── RRF 合并（三路）──
    hits = _rrf_merge(vector_hits, bm25_hits, graph_hits, top_k=top_k)

    # ── access_filter 后过滤（从 search_agent_knowledge 迁移）──
    if access_filter:
        owner_id = access_filter.get("owner_id", "")
        filtered = []
        for hit in hits:
            access_list = hit.get("access_list", ["public"])
            if "public" in access_list or owner_id in access_list:
                filtered.append(hit)
        hits = filtered

    # ── Cross-Encoder Rerank（RRF 后、PRF 前的精排层）──
    if KNOWLEDGE_RERANK_ENABLED and hits:
        from lumen.services.knowledge.rerank import rerank_knowledge_results
        hits = await rerank_knowledge_results(query, hits, KNOWLEDGE_RERANK_TOP_K, KNOWLEDGE_RERANK_MIN_SCORE)
        _last_search_meta["reranked"] = True

    # ── PRF 精炼：用 top-N 结果的向量修正查询，再搜一次 ──
    if PRF_ENABLED and hits:
        refined_vector = _prf_refine(db, query_vector, hits, PRF_ALPHA, PRF_BETA)
        if refined_vector:
            refined_results, _ = _vector_search(
                db, refined_vector, query, top_k * 3, min_score, payload_filter)
            refined_hits = []
            refined_seen = set()
            for hit in refined_results:
                payload = hit.payload if hasattr(hit, "payload") else {}
                if category and payload.get("category") != category:
                    continue
                key = (payload.get("file_id", ""), payload.get("chunk_index", 0))
                if key in refined_seen:
                    continue
                refined_seen.add(key)
                refined_hits.append({
                    "chunk_id": hit.id if hasattr(hit, "id") else 0,
                    "file_id": payload.get("file_id", ""),
                    "source_path": payload.get("source_path", ""),
                    "filename": payload.get("filename", ""),
                    "content": payload.get("content", ""),
                    "score": hit.score if hasattr(hit, "score") else 0.0,
                    "chunk_index": payload.get("chunk_index", 0),
                    "access_list": payload.get("access_list", ["public"]),
                })
                if len(refined_hits) >= top_k:
                    break
            if refined_hits:
                hits = refined_hits
                _last_search_meta["prf_refined"] = True
                logger.debug(f"知识库 PRF 精炼: {len(refined_hits)} 条结果")

    # ── access_filter 后过滤（PRF 后也要过滤）──
    if access_filter and hits:
        owner_id = access_filter.get("owner_id", "")
        filtered = []
        for hit in hits:
            access_list = hit.get("access_list", ["public"])
            if "public" in access_list or owner_id in access_list:
                filtered.append(hit)
        hits = filtered

    # ── 句子级精排 ──
    if KNOWLEDGE_SENTENCE_LEVEL and hits:
        refined = await refine_with_sentences(query, hits, kb_name=kb_name)
        _last_search_meta["sentence_refined"] = True
        return refined

    return hits

async def delete_file(file_id: str, kb_name: str = "knowledge") -> None:
    """删除文件：删向量 + 删源文件 + 更新 registry"""
    registry = _load_registry(kb_name)
    if file_id not in registry:
        raise FileNotFoundError(f"文件不存在: {file_id}")

    meta = registry[file_id]

    # 1. 删向量（chunk 级）
    db = _get_db_for(kb_name)
    result = db.tql_mut(f'MATCH (a {{file_id: {json.dumps(file_id)}}}) DETACH DELETE a')
    count = result.get("affected", 0) if isinstance(result, dict) else 0

    # 1.1 删 BM25 索引
    try:
        bm25_count = knowledge_chunks.delete_knowledge_chunks(file_id, kb_name)
        if bm25_count:
            logger.info(f"知识库 BM25 清理: {file_id}, {bm25_count} 条")
    except Exception as e:
        logger.warning(f"知识库 BM25 清理失败 ({file_id}): {e}")

    # 1.2 删稀疏向量
    try:
        from lumen.services.search.sparse_store import delete_by_file as delete_sparse
        delete_sparse(file_id, kb_name)
    except Exception as e:
        logger.warning(f"稀疏向量清理失败 ({file_id}): {e}")

    # 1.5 删句子向量（句子级）
    try:
        sdb = _get_sentence_db_for(kb_name)
        s_result = sdb.tql_mut(f'MATCH (a {{file_id: {json.dumps(file_id)}}}) DETACH DELETE a')
        s_count = s_result.get("affected", 0) if isinstance(s_result, dict) else 0
        logger.info(f"句子级清理: {file_id}, {s_count} 句")
    except Exception as e:
        logger.warning(f"句子级清理失败 ({file_id}): {e}")

    # 2. 删源文件
    source_path = meta.get("source_path", "")
    source_dir = _get_source_dir_for(kb_name)
    if source_path:
        full_path = os.path.join(source_dir, source_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            # 清理空目录
            _cleanup_empty_dirs(os.path.dirname(full_path), source_dir)

    # 3. 更新 registry
    del registry[file_id]
    _save_registry(registry, kb_name)

    logger.info(f"知识库删除: {file_id} ({meta.get('filename', '')}), 清理 {count} 条向量")

async def reindex_file(file_id: str, kb_name: str = "knowledge") -> dict:
    """重新索引已修改的文件（全文件覆写，幂等）。

    流程：删旧数据 → 重读源文件 → 重新分块嵌入 → 更新 registry
    """
    with _registry_lock:
        registry = _load_registry(kb_name)
    if file_id not in registry:
        return {"error": f"file_id {file_id} not found in registry"}

    info = registry[file_id]
    source_path = info.get("source_path", "")
    category = info.get("category", "")
    source = info.get("source", "upload")

    # 构建源文件完整路径
    source_dir = _get_source_dir_for(kb_name)
    full_path = os.path.join(source_dir, source_path)
    if not os.path.exists(full_path):
        return {"error": f"source file not found: {source_path}"}

    # 读取文件内容
    content = _read_file_content(full_path)
    if content is None:
        return {"error": f"cannot read file: {source_path}"}

    # 1. 删除旧数据（复用 delete_file 的清理逻辑，但不删源文件和 registry 条目）
    db = _get_db_for(kb_name)
    db.tql_mut(f'MATCH (a {{file_id: {json.dumps(file_id)}}}) DETACH DELETE a')

    # 清理句子库
    try:
        _get_sentence_db_for(kb_name).tql_mut(f'MATCH (a {{file_id: {json.dumps(file_id)}}}) DETACH DELETE a')
    except Exception as e:
        logger.warning(f"重索引句子级清理失败 ({file_id}): {e}")

    # 清理 BM25
    try:
        knowledge_chunks.delete_knowledge_chunks(file_id, kb_name)
    except Exception as e:
        logger.warning(f"重索引 BM25 清理失败 ({file_id}): {e}")

    # 清理 sparse
    try:
        from lumen.services.search.sparse_store import delete_by_file as delete_sparse
        delete_sparse(file_id, kb_name)
    except Exception as e:
        logger.warning(f"重索引稀疏向量清理失败 ({file_id}): {e}")

    # 2. 重新分块
    chunks = chunk_text(content, KNOWLEDGE_CHUNK_SIZE, KNOWLEDGE_CHUNK_OVERLAP)
    if not chunks:
        chunks = [content] if content.strip() else []

    if not chunks:
        # 空内容，只更新 registry
        new_md5 = _compute_md5(content)
        with _registry_lock:
            reg = _load_registry(kb_name)
            reg[file_id]["md5"] = new_md5
            reg[file_id]["graph_sync_needed"] = True
            reg[file_id]["chunk_count"] = 0
            reg[file_id]["char_count"] = len(content)
            from datetime import datetime as _dt
            reg[file_id]["updated_at"] = _dt.now().isoformat()
            _save_registry(reg, kb_name)
        return {"file_id": file_id, "chunks": 0, "md5": new_md5}

    # 3. 重新嵌入
    backend = await get_embedding_service(kb_name)

    vectors = None
    sparse_vectors = None

    if SPARSE_EMBEDDING_ENABLED and hasattr(backend, 'encode_batch_with_sparse'):
        try:
            sparse_result = await backend.encode_batch_with_sparse(
                chunks, instruction_type="document"
            )
            if sparse_result:
                vectors = [r[0] for r in sparse_result]
                sparse_vectors = [r[1] for r in sparse_result]
        except Exception as e:
            logger.warning(f"重索引稀疏向量编码失败，回退纯稠密: {e}")

    if not vectors:
        vectors = await backend.encode_batch(chunks) if backend else None
    if not vectors:
        return {"error": "Embedding 服务不可用，无法向量化"}

    # 4. 存入 TriviumDB
    folder = os.path.dirname(source_path).replace("\\", "/") if "/" in source_path else ""
    node_ids = []
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        payload = {
            "file_id": file_id,
            "source_path": source_path,
            "filename": info.get("filename", ""),
            "category": category,
            "source": source,
            "chunk_index": i,
            "content": chunk,
            "tags": [],
            "folder": folder,
        }
        nid = db.insert(vector, payload)
        node_ids.append(nid)
        _index_chunk_text(db, nid, chunk, info.get("filename", ""), folder)
    db.flush()
    try:
        db.build_text_index()
    except Exception as e:
        logger.debug(f"build_text_index 失败 ({file_id}): {e}")

    # 4.1 存入稀疏向量
    if sparse_vectors:
        try:
            from lumen.services.search.sparse_store import save_sparse_batch
            items = []
            for i, sv in enumerate(sparse_vectors):
                if sv:
                    items.append({
                        "node_id": node_ids[i],
                        "file_id": file_id,
                        "chunk_index": i,
                        "category": category,
                        "sparse_data": sv,
                    })
            if items:
                save_sparse_batch(items)
        except Exception as e:
            logger.warning(f"重索引稀疏向量存储失败 ({file_id}): {e}")

    # 4.5 句子级向量化
    sentence_backend = await get_embedding_service("knowledge_sentences")
    if sentence_backend:
        sdb = _get_sentence_db_for(kb_name)
        total_sentences = 0
        for i, chunk in enumerate(chunks):
            sentences = split_sentences(chunk)
            if not sentences:
                continue
            sentence_vectors = await sentence_backend.encode_batch(sentences)
            if not sentence_vectors:
                continue
            for j, (sent, svec) in enumerate(zip(sentences, sentence_vectors)):
                sdb.insert(svec, {
                    "file_id": file_id,
                    "source_path": source_path,
                    "category": category,
                    "chunk_index": i,
                    "sentence_index": j,
                    "content": sent,
                })
                total_sentences += 1
        if total_sentences:
            sdb.flush()
            logger.info(f"重索引句子级向量化: {file_id}, {total_sentences} 句")

    # 5. BM25 重建
    try:
        knowledge_chunks.save_knowledge_chunks_batch(file_id, source_path, info.get("filename", ""), category, chunks, kb_name=kb_name)
    except Exception as e:
        logger.warning(f"重索引 BM25 写入失败 ({file_id}): {e}")

    # 6. 更新 registry
    new_md5 = _compute_md5(content)
    from datetime import datetime as _dt
    with _registry_lock:
        reg = _load_registry(kb_name)
        reg[file_id]["md5"] = new_md5
        reg[file_id]["graph_sync_needed"] = True
        reg[file_id]["chunk_count"] = len(chunks)
        reg[file_id]["char_count"] = len(content)
        reg[file_id]["updated_at"] = _dt.now().isoformat()
        _save_registry(reg, kb_name)

    logger.info(f"知识库重索引: {file_id} ({info.get('filename', '')}), {len(chunks)} chunks")
    return {"file_id": file_id, "chunks": len(chunks), "md5": new_md5}

# ── 文件夹列表缓存（供 ACL 前置过滤用） ──
_folder_cache: list[str] = []
_folder_cache_ts: float = 0

def _get_all_folders(db, max_age: float = 60.0) -> list[str]:
    """获取知识库中所有不重复的 folder 路径（带 60 秒缓存）"""
    global _folder_cache, _folder_cache_ts
    now = time.time()
    if _folder_cache and (now - _folder_cache_ts) < max_age:
        return _folder_cache

    folders = set()
    for node_id in db.all_node_ids():
        payload = db.get_payload(node_id)
        if payload and "folder" in payload:
            folders.add(payload["folder"])
    _folder_cache = sorted(folders)
    _folder_cache_ts = now
    return _folder_cache

def close():
    """关闭 TriviumDB（已迁移到 tdb_registry）"""
    from lumen.services.tdb_registry import close_all
    close_all()

def cleanup_orphan_registry(kb_name: str = "knowledge") -> int:
    """清理 registry 中指向不存在 TDB 节点的孤儿条目 + 级联清理关联索引

    场景：用户手动删了 TDB 节点/文件、TDB 重建后，registry 和索引里残留旧条目。
    对每个孤儿 file_id，同步清理：registry + BM25 + 稀疏向量 + 句子向量。

    Returns:
        清理的孤儿条目数
    """
    try:
        db = _get_db_for(kb_name)
    except Exception:
        logger.warning("cleanup_orphan_registry: TDB 不可用，跳过")
        return 0

    registry = _load_registry(kb_name)
    orphans = []

    for file_id, meta in registry.items():
        has_chunk = False
        try:
            rows = db.tql(f'FIND {{file_id: {json.dumps(file_id)}}} RETURN id')
            if rows:
                has_chunk = True
        except Exception:
            continue

        if not has_chunk:
            orphans.append(file_id)

    if not orphans:
        return 0

    # 级联清理每个孤儿 file_id 的所有关联数据
    for fid in orphans:
        # BM25
        try:
            knowledge_chunks.delete_knowledge_chunks(fid, kb_name)
        except Exception as e:
            logger.warning(f"孤儿 BM25 清理失败 ({fid}): {e}")

        # 稀疏向量
        try:
            from lumen.services.search.sparse_store import delete_by_file as delete_sparse
            delete_sparse(fid, kb_name)
        except Exception as e:
            logger.warning(f"孤儿稀疏向量清理失败 ({fid}): {e}")

        # 句子向量
        try:
            sdb = _get_sentence_db_for(kb_name)
            sdb.tql_mut(f'MATCH (a {{file_id: {json.dumps(fid)}}}) DETACH DELETE a')
        except Exception as e:
            logger.warning(f"孤儿句子向量清理失败 ({fid}): {e}")

        del registry[fid]

    _save_registry(registry, kb_name)
    logger.info(f"Registry 级联清理: {len(orphans)} 个孤儿条目（registry + BM25 + 稀疏 + 句子）")
    return len(orphans)

async def rebuild_if_empty(kb_name: str = "knowledge"):
    """启动时检测 knowledge.tdb 是否为空，为空则从源文件自动重建。

    场景：用户换了 embedding API、删除了 TDB 文件、或首次启动。
    扫描源文件目录下所有 .md/.txt/.markdown 文件，
    跳过 _manifest.json 和已有条目的文件，逐个调用 import_file。
    """
    db = _get_db_for(kb_name)
    node_ids = db.all_node_ids()
    if len(node_ids) > 0:
        logger.info(f"知识库已有 {len(node_ids)} 条向量，跳过自动重建")
        return

    logger.info("知识库为空，扫描源文件进行自动重建...")

    source_dir = _get_source_dir_for(kb_name)
    if not os.path.isdir(source_dir):
        logger.info("源文件目录不存在，跳过")
        return

    # 收集已有 source_path（虽然为空，但防并发）
    existing_paths = set()

    ALLOWED_EXT = {".md", ".txt", ".markdown"}
    files_to_import = []

    for dirpath, dirnames, filenames in os.walk(source_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for f in sorted(filenames):
            if f == "_manifest.json":
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in ALLOWED_EXT:
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, source_dir).replace("\\", "/")
                if rel_path not in existing_paths:
                    files_to_import.append((full_path, rel_path))

    if not files_to_import:
        logger.info("无源文件需要导入")
        return

    logger.info(f"发现 {len(files_to_import)} 个源文件，开始自动重建...")

    imported = 0
    failed = 0
    for full_path, rel_path in files_to_import:
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            if not content.strip():
                continue
            parts = rel_path.split("/")
            filename = parts[-1]
            category = parts[0] if len(parts) > 1 else "imports"
            subdir = "/".join(parts[1:-1]) if len(parts) > 2 else ""
            # 保留原始来源：daily_note 目录下的 = daily_note，其余 = upload
            source = parts[0] if parts[0] == "daily_note" else "upload"
            await import_file(filename, content, category=category, subdir=subdir, source=source, kb_name=kb_name)
            imported += 1
        except Exception as e:
            failed += 1
            logger.warning(f"自动重建失败: {rel_path}: {e}")

    logger.info(f"自动重建完成: 导入 {imported} 个文件, 失败 {failed} 个")

    # 重建完成后恢复图谱实体
    if imported > 0:
        try:
            from lumen.services.graph import restore_graph
            restored = restore_graph(kb_name)
            if restored > 0:
                logger.info(f"图谱实体已从备份恢复: {restored} 个")
        except Exception as e:
            logger.warning(f"图谱恢复失败: {e}")

# ── 内部工具 ──

def _build_meta(
    fid: str, filename: str, category: str, subdir: str,
    chunk_count: int, char_count: int, now: str,
    content: str = "",
) -> Dict:
    rel_path = os.path.join(category, subdir, filename) if subdir else os.path.join(category, filename)
    rel_path = rel_path.replace("\\", "/")
    ext = os.path.splitext(filename)[1].lstrip(".") or "txt"
    return {
        "id": fid,
        "source_path": rel_path,
        "filename": filename,
        "file_type": ext,
        "category": category,
        "chunk_count": chunk_count,
        "char_count": char_count,
        "tags": [],
        "created_at": now,
        "updated_at": now,
        "md5": _compute_md5(content) if content else "",
        "graph_sync_needed": False,
    }

def _update_registry(fid: str, meta: Dict, kb_name: str = "knowledge") -> None:
    with _registry_lock:
        registry = _load_registry(kb_name)
        registry[fid] = meta
        _save_registry(registry, kb_name)

def _cleanup_empty_dirs(current: str, stop_at: str) -> None:
    """递归清理空目录（到 stop_at 为止）"""
    while current and current != stop_at and os.path.isdir(current):
        try:
            if not os.listdir(current):
                os.rmdir(current)
                current = os.path.dirname(current)
            else:
                break
        except OSError:
            break
