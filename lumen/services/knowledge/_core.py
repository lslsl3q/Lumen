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
from typing import Optional, List, Dict

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
)
from lumen.services.embedding import get_service as get_embedding_service
from lumen.services.knowledge.chunker import chunk_text, split_sentences
from lumen.services import history

logger = logging.getLogger(__name__)

# ── 最后一次搜索的元数据（供调用方读取各路径命中数和方法）──
_last_search_meta: dict = {}

def get_last_search_meta() -> dict:
    """返回最近一次 knowledge.search() 的元数据（副本）"""
    return _last_search_meta.copy()

# ── TriviumDB 单例（独立于 memory.tdb）──
_db: Optional[triviumdb.TriviumDB] = None
_db_lock = threading.Lock()

# ── Agent 知识库 TriviumDB 单例（阵营 B，独立于 knowledge.tdb）──
_agent_db: Optional[triviumdb.TriviumDB] = None
_agent_db_lock = threading.Lock()

# ── 句子级 TriviumDB 单例（独立于 knowledge.tdb，不同维度）──
_sentence_db: Optional[triviumdb.TriviumDB] = None
_sentence_db_lock = threading.Lock()

# ── 维度持久化 ──
_KNOWLEDGE_DIM_FILE = KNOWLEDGE_DB_PATH + ".dim"
_AGENT_KNOWLEDGE_DIM_FILE = AGENT_KNOWLEDGE_DB_PATH + ".dim"
_SENTENCE_DIM_FILE = KNOWLEDGE_SENTENCE_DB_PATH + ".dim"


def _save_dim(dim_file: str, dim: int):
    try:
        with open(dim_file, "w") as f:
            f.write(str(dim))
    except Exception:
        pass


# ── Registry 缓存 ──
_registry_cache: Optional[Dict[str, Dict]] = None
_registry_lock = threading.Lock()

MANIFEST_PATH = os.path.join(KNOWLEDGE_SOURCE_DIR, "_manifest.json")


def _get_db() -> triviumdb.TriviumDB:
    """获取 knowledge.tdb 实例（单例，线程安全）"""
    global _db
    if _db is None:
        with _db_lock:
            if _db is None:
                os.makedirs(os.path.dirname(KNOWLEDGE_DB_PATH), exist_ok=True)
                from lumen.services.embedding import resolve_dimensions, check_dim_consistency, _save_dim_file
                dim = resolve_dimensions("knowledge")

                # 维度一致性检查 — 不匹配就报错
                err = check_dim_consistency(KNOWLEDGE_DB_PATH, dim)
                if err:
                    raise RuntimeError(err)

                _db = triviumdb.TriviumDB(KNOWLEDGE_DB_PATH, dim=dim)
                _save_dim_file(KNOWLEDGE_DB_PATH, dim)
                # v0.6.0 属性二级索引
                for field in ["owner_id", "type", "status", "source"]:
                    try:
                        _db.create_index(field)
                    except Exception:
                        pass
                logger.info(f"知识库 TriviumDB 已打开: {KNOWLEDGE_DB_PATH} (维度: {dim})")
    return _db


def _get_agent_db() -> triviumdb.TriviumDB:
    """获取 agent_knowledge.tdb 实例（单例，线程安全，阵营 B 维度）"""
    global _agent_db
    if _agent_db is None:
        with _agent_db_lock:
            if _agent_db is None:
                os.makedirs(os.path.dirname(AGENT_KNOWLEDGE_DB_PATH), exist_ok=True)
                from lumen.services.embedding import resolve_dimensions, check_dim_consistency, _save_dim_file
                dim = resolve_dimensions("agent_knowledge")

                err = check_dim_consistency(AGENT_KNOWLEDGE_DB_PATH, dim)
                if err:
                    raise RuntimeError(err)

                _agent_db = triviumdb.TriviumDB(AGENT_KNOWLEDGE_DB_PATH, dim=dim)
                _save_dim_file(AGENT_KNOWLEDGE_DB_PATH, dim)
                for field in ["owner_id", "type", "status"]:
                    try:
                        _agent_db.create_index(field)
                    except Exception:
                        pass
                logger.info(f"Agent 知识库 TriviumDB 已打开: {AGENT_KNOWLEDGE_DB_PATH} (维度: {dim})")
    return _agent_db


def _get_sentence_db() -> triviumdb.TriviumDB:
    """获取 knowledge_sentences.tdb 实例（单例，用小模型维度）"""
    global _sentence_db
    if _sentence_db is None:
        with _sentence_db_lock:
            if _sentence_db is None:
                os.makedirs(os.path.dirname(KNOWLEDGE_SENTENCE_DB_PATH), exist_ok=True)
                from lumen.services.embedding import resolve_dimensions
                dim = resolve_dimensions("knowledge_sentences")
                _sentence_db = triviumdb.TriviumDB(KNOWLEDGE_SENTENCE_DB_PATH, dim=dim)
                _save_dim(_SENTENCE_DIM_FILE, dim)
                logger.info(f"句子级 TriviumDB 已打开: {KNOWLEDGE_SENTENCE_DB_PATH} (维度: {dim})")
    return _sentence_db


def _prf_refine(db, query_vector: list[float], hits: list[dict],
                alpha: float, beta: float) -> list[float] | None:
    """PRF 精炼查询向量（从 knowledge.tdb 读回已存向量，零嵌入开销）"""
    from lumen.config import PRF_TOP_N
    top_n = hits[:PRF_TOP_N]
    if not top_n:
        return None

    vectors = []
    for hit in top_n:
        node_id = hit.get("chunk_id")
        if not node_id:
            continue
        try:
            node = db.get(node_id)
            if node and hasattr(node, "vector") and node.vector:
                vectors.append(node.vector)
        except Exception:
            continue

    if not vectors:
        return None

    dim = len(vectors[0])
    centroid = [0.0] * dim
    for vec in vectors:
        for i in range(dim):
            centroid[i] += vec[i]
    for i in range(dim):
        centroid[i] /= len(vectors)

    refined = [alpha * query_vector[i] + beta * centroid[i] for i in range(dim)]

    norm = sum(x * x for x in refined) ** 0.5
    if norm > 0:
        refined = [x / norm for x in refined]

    return refined


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
            nodes = db.filter_where({"file_id": fid})
            for node in nodes:
                payload = node.payload if hasattr(node, "payload") else {}
                if payload.get("chunk_index") == ci:
                    hit["content"] = payload.get("content", "")
                    hit["source_path"] = payload.get("source_path", "")
                    hit["filename"] = payload.get("filename", "")
                    break
        except Exception:
            continue


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
    scores: Dict[tuple, float] = {}
    content_map: Dict[tuple, dict] = {}

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


def _load_registry() -> Dict[str, Dict]:
    """加载 registry（从 _manifest.json 的 files 字段，带内存缓存）"""
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache
    try:
        if os.path.exists(MANIFEST_PATH):
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                _registry_cache = manifest.get("files", {})
            return _registry_cache
    except (json.JSONDecodeError, IOError):
        pass
    _registry_cache = {}
    return _registry_cache


def _save_registry(registry: Dict[str, Dict]) -> None:
    """保存 registry（写回 _manifest.json 的 files 字段）并刷新缓存"""
    global _registry_cache
    manifest = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    manifest["files"] = registry
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    _registry_cache = registry


def _clear_registry_cache() -> None:
    global _registry_cache
    _registry_cache = None


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


def list_files(category: str = None) -> List[Dict]:
    """列出所有已导入的文件元数据，可按 category 过滤"""
    registry = _load_registry()
    entries = list(registry.values())
    if category:
        entries = [e for e in entries if e.get("category") == category]
    return sorted(entries, key=lambda e: e.get("created_at", ""), reverse=True)


def get_file(file_id: str) -> Dict:
    """获取单个文件的元数据"""
    registry = _load_registry()
    if file_id not in registry:
        raise FileNotFoundError(f"文件不存在: {file_id}")
    return registry[file_id]


async def import_file(
    filename: str,
    content: str,
    category: str = "imports",
    subdir: str = "",
    source: str = "upload",
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
    if subdir:
        source_dir = os.path.join(KNOWLEDGE_SOURCE_DIR, category, subdir)
    else:
        source_dir = os.path.join(KNOWLEDGE_SOURCE_DIR, category)
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
        _update_registry(fid, meta)
        logger.info(f"知识库导入（空内容）: {fid} ({filename})")
        return meta

    # 3. 批量嵌入（尝试同时获取稠密+稀疏向量）
    backend = await get_embedding_service("knowledge")

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
    db = _get_db()
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
        }
        nid = db.insert(vector, payload)
        node_ids.append(nid)
    db.flush()

    # 4.1 存入稀疏向量（如果获取成功）
    if sparse_vectors:
        try:
            from lumen.services.sparse_store import save_sparse_batch
            items = []
            for i, sv in enumerate(sparse_vectors):
                if sv:
                    items.append({
                        "node_id": node_ids[i],
                        "file_id": fid,
                        "chunk_index": i,
                        "category": category,
                        "sparse_data": sv,
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
                content=content, tdb_name="knowledge",
                source_episode_id=fid, owner_id="",
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
        history.save_knowledge_chunks_batch(fid, rel_path, filename, category, chunks)
    except Exception as e:
        logger.warning(f"知识库 BM25 索引写入失败 ({fid}): {e}")

    # 5. 句子级向量化（小模型，独立 TDB）
    sentence_backend = await get_embedding_service("knowledge_sentences")
    if sentence_backend:
        sdb = _get_sentence_db()
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
    _update_registry(fid, meta)

    logger.info(f"知识库导入: {fid} ({filename}), {len(chunks)} chunks")
    return meta


async def refine_with_sentences(
    query: str,
    top_chunks: list[dict],
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

    sdb = _get_sentence_db()

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
            nodes = sdb.filter_where({"file_id": fid})
            for node in nodes:
                payload = node.payload if hasattr(node, "payload") else {}
                ci = payload.get("chunk_index", 0)
                if (fid, ci) not in target_chunks:
                    continue
                vec = node.vector if hasattr(node, "vector") else None
                all_sentences.append({
                    "content": payload.get("content", ""),
                    "file_id": fid,
                    "chunk_index": ci,
                    "sentence_index": payload.get("sentence_index", 0),
                    "source_path": payload.get("source_path", ""),
                    "filename": payload.get("filename", ""),
                    "category": payload.get("category", ""),
                    "vector": vec,
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
) -> List[Dict]:
    """混合搜索: 向量 + BM25 + 图谱 → 三路 RRF 合并 → PRF 精炼 → 句子级精排"""
    from lumen.config import PRF_ENABLED, PRF_ALPHA, PRF_BETA

    backend = await get_embedding_service("knowledge")
    query_vector = await backend.encode(query) if backend else None
    if not query_vector:
        return []

    db = _get_db()

    # ── Path A: 向量搜索 ──
    results = db.search(query_vector, top_k=top_k * 3, min_score=min_score)
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
            from lumen.services.sparse_store import has_sparse_data, search_sparse
            if has_sparse_data():
                sparse_result = await backend.encode_with_sparse(
                    query, instruction_type="query"
                )
                if sparse_result:
                    _, query_sparse = sparse_result
                    bm25_hits = search_sparse(query_sparse, category or "", top_k)
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
                bm25_hits = history.search_knowledge_bm25(
                    keywords, category=category or "", limit=top_k
                )
                # 主动记忆（daily_note）也走 BM25，合并到同一路径进 RRF
                if not category or category.startswith("active"):
                    active_hits = []
                    for kw in keywords:
                        active_hits.extend(
                            history.search_active_memories_bm25(kw, limit=top_k)
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

    # ── Path C: 图谱召回（T19）──
    graph_hits = []
    try:
        from lumen.config import GRAPH_RECALL_TOP_K
        from lumen.services.graph import get_entity_neighbors_text
        # searchHybrid 在图谱实体中找锚点
        graph_results = db.search(query_vector, top_k=GRAPH_RECALL_TOP_K, min_score=0.1)
        entity_ids = []
        for r in graph_results:
            payload = r.payload if hasattr(r, "payload") else {}
            if "name" in payload and "type" in payload:
                eid = r.id if hasattr(r, "id") else 0
                if eid:
                    entity_ids.append(eid)
        if entity_ids:
            snippets = get_entity_neighbors_text("knowledge", entity_ids)
            for eid, snippet in zip(entity_ids, snippets):
                graph_hits.append({
                    "entity_id": eid,
                    "content": f"[图谱] {snippet}",
                    "score": 0.5,
                })
    except Exception as e:
        logger.debug(f"图谱召回跳过: {e}")

    # ── 记录搜索元数据（先于 PRF 和句子级精排）──
    global _last_search_meta
    _last_search_meta = {
        "vector_count": len(vector_hits),
        "sparse_count": len(bm25_hits) if sparse_used else 0,
        "bm25_count": 0 if sparse_used else len(bm25_hits),
        "graph_count": len(graph_hits),
        "bm25_method": "sparse" if sparse_used else "bm25",
    }

    # ── RRF 合并（三路）──
    hits = _rrf_merge(vector_hits, bm25_hits, graph_hits, top_k=top_k)

    # ── PRF 精炼：用 top-N 结果的向量修正查询，再搜一次 ──
    if PRF_ENABLED and hits:
        refined_vector = _prf_refine(db, query_vector, hits, PRF_ALPHA, PRF_BETA)
        if refined_vector:
            refined_results = db.search(refined_vector, top_k=top_k * 3, min_score=min_score)
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
                })
                if len(refined_hits) >= top_k:
                    break
            if refined_hits:
                hits = refined_hits
                _last_search_meta["prf_refined"] = True
                logger.debug(f"知识库 PRF 精炼: {len(refined_hits)} 条结果")

    # ── 句子级精排 ──
    if KNOWLEDGE_SENTENCE_LEVEL and hits:
        refined = await refine_with_sentences(query, hits)
        _last_search_meta["sentence_refined"] = True
        return refined

    return hits


async def search_agent_knowledge(
    query: str,
    agent_id: str = "",
    top_k: int = 5,
    min_score: float = 0.3,
) -> List[Dict]:
    """搜索 agent_knowledge.tdb，按 access_list 过滤

    Args:
        query: 搜索文本
        agent_id: 当前 Agent ID，用于过滤 access_list（空 = 不过滤）
        top_k: 返回条数
        min_score: 最低相似度
    """
    backend = await get_embedding_service("agent_knowledge")
    query_vector = await backend.encode(query) if backend else None
    if not query_vector:
        return []

    db = _get_agent_db()
    results = db.search(query_vector, top_k=top_k * 3, min_score=min_score)

    hits = []
    seen = set()
    for hit in results:
        payload = hit.payload if hasattr(hit, "payload") else {}
        access_list = payload.get("access_list", ["public"])

        # 按 access_list 过滤
        if agent_id and "public" not in access_list and agent_id not in access_list:
            continue

        key = (payload.get("file_id", ""), payload.get("chunk_index", 0))
        if key in seen:
            continue
        seen.add(key)

        hits.append({
            "chunk_id": hit.id if hasattr(hit, "id") else 0,
            "file_id": payload.get("file_id", ""),
            "source_path": payload.get("source_path", ""),
            "filename": payload.get("filename", ""),
            "content": payload.get("content", ""),
            "score": hit.score if hasattr(hit, "score") else 0.0,
            "chunk_index": payload.get("chunk_index", 0),
            "owner_id": payload.get("owner_id", ""),
            "access_list": access_list,
            "source": payload.get("source", ""),
        })
        if len(hits) >= top_k:
            break

    return hits


async def delete_file(file_id: str) -> None:
    """删除文件：删向量 + 删源文件 + 更新 registry"""
    registry = _load_registry()
    if file_id not in registry:
        raise FileNotFoundError(f"文件不存在: {file_id}")

    meta = registry[file_id]

    # 1. 删向量（chunk 级）
    db = _get_db()
    nodes = db.filter_where({"file_id": file_id})
    count = 0
    for node in nodes:
        db.delete(node.id)
        count += 1
    if count:
        db.flush()

    # 1.1 删 BM25 索引
    try:
        bm25_count = history.delete_knowledge_chunks(file_id)
        if bm25_count:
            logger.info(f"知识库 BM25 清理: {file_id}, {bm25_count} 条")
    except Exception as e:
        logger.warning(f"知识库 BM25 清理失败 ({file_id}): {e}")

    # 1.2 删稀疏向量
    try:
        from lumen.services.sparse_store import delete_by_file as delete_sparse
        delete_sparse(file_id)
    except Exception as e:
        logger.warning(f"稀疏向量清理失败 ({file_id}): {e}")

    # 1.5 删句子向量（句子级）
    if _sentence_db is not None:
        try:
            s_nodes = _sentence_db.filter_where({"file_id": file_id})
            s_count = 0
            for node in s_nodes:
                _sentence_db.delete(node.id)
                s_count += 1
            if s_count:
                _sentence_db.flush()
                logger.info(f"句子级清理: {file_id}, {s_count} 句")
        except Exception as e:
            logger.warning(f"句子级清理失败 ({file_id}): {e}")

    # 2. 删源文件
    source_path = meta.get("source_path", "")
    if source_path:
        full_path = os.path.join(KNOWLEDGE_SOURCE_DIR, source_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            # 清理空目录
            _cleanup_empty_dirs(os.path.dirname(full_path), KNOWLEDGE_SOURCE_DIR)

    # 3. 更新 registry
    del registry[file_id]
    _save_registry(registry)

    logger.info(f"知识库删除: {file_id} ({meta.get('filename', '')}), 清理 {count} 条向量")


async def reindex_file(file_id: str) -> dict:
    """重新索引已修改的文件（全文件覆写，幂等）。

    流程：删旧数据 → 重读源文件 → 重新分块嵌入 → 更新 registry
    """
    with _registry_lock:
        registry = _load_registry()
    if file_id not in registry:
        return {"error": f"file_id {file_id} not found in registry"}

    info = registry[file_id]
    source_path = info.get("source_path", "")
    category = info.get("category", "")
    source = info.get("source", "upload")

    # 构建源文件完整路径
    full_path = os.path.join(KNOWLEDGE_SOURCE_DIR, source_path)
    if not os.path.exists(full_path):
        return {"error": f"source file not found: {source_path}"}

    # 读取文件内容
    content = _read_file_content(full_path)
    if content is None:
        return {"error": f"cannot read file: {source_path}"}

    # 1. 删除旧数据（复用 delete_file 的清理逻辑，但不删源文件和 registry 条目）
    db = _get_db()
    nodes = db.filter_where({"file_id": file_id})
    for node in nodes:
        db.delete(node.id)
    db.flush()

    # 清理句子库
    if _sentence_db is not None:
        try:
            s_nodes = _sentence_db.filter_where({"file_id": file_id})
            for node in s_nodes:
                _sentence_db.delete(node.id)
            _sentence_db.flush()
        except Exception as e:
            logger.warning(f"重索引句子级清理失败 ({file_id}): {e}")

    # 清理 BM25
    try:
        history.delete_knowledge_chunks(file_id)
    except Exception as e:
        logger.warning(f"重索引 BM25 清理失败 ({file_id}): {e}")

    # 清理 sparse
    try:
        from lumen.services.sparse_store import delete_by_file as delete_sparse
        delete_sparse(file_id)
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
            reg = _load_registry()
            reg[file_id]["md5"] = new_md5
            reg[file_id]["graph_sync_needed"] = True
            reg[file_id]["chunk_count"] = 0
            reg[file_id]["char_count"] = len(content)
            from datetime import datetime as _dt
            reg[file_id]["updated_at"] = _dt.now().isoformat()
            _save_registry(reg)
        return {"file_id": file_id, "chunks": 0, "md5": new_md5}

    # 3. 重新嵌入
    backend = await get_embedding_service("knowledge")

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
        }
        nid = db.insert(vector, payload)
        node_ids.append(nid)
    db.flush()

    # 4.1 存入稀疏向量
    if sparse_vectors:
        try:
            from lumen.services.sparse_store import save_sparse_batch
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
        sdb = _get_sentence_db()
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
        history.save_knowledge_chunks_batch(file_id, source_path, info.get("filename", ""), category, chunks)
    except Exception as e:
        logger.warning(f"重索引 BM25 写入失败 ({file_id}): {e}")

    # 6. 更新 registry
    new_md5 = _compute_md5(content)
    from datetime import datetime as _dt
    with _registry_lock:
        reg = _load_registry()
        reg[file_id]["md5"] = new_md5
        reg[file_id]["graph_sync_needed"] = True
        reg[file_id]["chunk_count"] = len(chunks)
        reg[file_id]["char_count"] = len(content)
        reg[file_id]["updated_at"] = _dt.now().isoformat()
        _save_registry(reg)

    logger.info(f"知识库重索引: {file_id} ({info.get('filename', '')}), {len(chunks)} chunks")
    return {"file_id": file_id, "chunks": len(chunks), "md5": new_md5}


def close():
    """关闭 TriviumDB"""
    global _db, _sentence_db, _agent_db
    if _db is not None:
        _db.flush()
        _db = None
        logger.info("知识库 TriviumDB 已关闭")
    if _agent_db is not None:
        _agent_db.flush()
        _agent_db = None
        logger.info("Agent 知识库 TriviumDB 已关闭")
    if _sentence_db is not None:
        _sentence_db.flush()
        _sentence_db = None
        logger.info("句子级 TriviumDB 已关闭")


def cleanup_orphan_registry() -> int:
    """清理 registry 中指向不存在 TDB 节点的孤儿条目

    场景：用户在 MemoryWindow 编辑器手动删了 TDB 节点，
    或 TDB 文件损坏/重建后，registry 里残留旧条目。

    Returns:
        清理的孤儿条目数
    """
    db = _get_db()
    all_ids = set(db.all_node_ids())

    registry = _load_registry()
    orphans = []

    for file_id, meta in registry.items():
        # 检查 knowledge.tdb 中是否有至少一条属于此 file_id 的节点
        has_chunk = False
        try:
            nodes = db.filter_where({"file_id": file_id})
            for node in nodes:
                nid = node.id if hasattr(node, "id") else None
                if nid and nid in all_ids:
                    has_chunk = True
                    break
        except Exception:
            # filter_where 失败 → 保守策略，不删
            continue

        if not has_chunk:
            orphans.append(file_id)

    if orphans:
        for fid in orphans:
            del registry[fid]
        _save_registry(registry)
        logger.info(f"Registry 清理: {len(orphans)} 个孤儿条目已移除")

    return len(orphans)


async def rebuild_if_empty():
    """启动时检测 knowledge.tdb 是否为空，为空则从源文件自动重建。

    场景：用户换了 embedding API、删除了 TDB 文件、或首次启动。
    扫描 KNOWLEDGE_SOURCE_DIR 下所有 .md/.txt/.markdown 文件，
    跳过 _manifest.json 和已有条目的文件，逐个调用 import_file。
    """
    db = _get_db()
    node_ids = db.all_node_ids()
    if len(node_ids) > 0:
        logger.info(f"知识库已有 {len(node_ids)} 条向量，跳过自动重建")
        return

    logger.info("知识库为空，扫描源文件进行自动重建...")

    if not os.path.isdir(KNOWLEDGE_SOURCE_DIR):
        logger.info("源文件目录不存在，跳过")
        return

    # 收集已有 source_path（虽然为空，但防并发）
    existing_paths = set()

    ALLOWED_EXT = {".md", ".txt", ".markdown"}
    files_to_import = []

    for dirpath, dirnames, filenames in os.walk(KNOWLEDGE_SOURCE_DIR):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for f in sorted(filenames):
            if f == "_manifest.json":
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in ALLOWED_EXT:
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, KNOWLEDGE_SOURCE_DIR).replace("\\", "/")
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
            await import_file(filename, content, category=category, subdir=subdir, source=source)
            imported += 1
        except Exception as e:
            failed += 1
            logger.warning(f"自动重建失败: {rel_path}: {e}")

    logger.info(f"自动重建完成: 导入 {imported} 个文件, 失败 {failed} 个")

    # 重建完成后恢复图谱实体
    if imported > 0:
        try:
            from lumen.services.graph import restore_graph
            restored = restore_graph("knowledge")
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


def _update_registry(fid: str, meta: Dict) -> None:
    with _registry_lock:
        registry = _load_registry()
        registry[fid] = meta
        _save_registry(registry)


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
