"""
Lumen - 知识库存储服务
管理源文件、切分、向量化、搜索
单个 TriviumDB 实例 + category 字段区分不同来源
"""

import json
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
    KNOWLEDGE_CHUNK_SIZE,
    KNOWLEDGE_CHUNK_OVERLAP,
    KNOWLEDGE_SOURCE_DIR,
    KNOWLEDGE_SENTENCE_DB_PATH,
    KNOWLEDGE_SENTENCE_LEVEL,
    KNOWLEDGE_SENTENCE_TOP_N,
    KNOWLEDGE_SENTENCE_WINDOW,
)
from lumen.services.embedding import get_service as get_embedding_service
from lumen.services.chunker import chunk_text, split_sentences
from lumen.services import history

logger = logging.getLogger(__name__)

# ── TriviumDB 单例（独立于 memory.tdb）──
_db: Optional[triviumdb.TriviumDB] = None
_db_lock = threading.Lock()

# ── 句子级 TriviumDB 单例（独立于 knowledge.tdb，不同维度）──
_sentence_db: Optional[triviumdb.TriviumDB] = None
_sentence_db_lock = threading.Lock()

# ── 维度持久化 ──
_KNOWLEDGE_DIM_FILE = KNOWLEDGE_DB_PATH + ".dim"
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

REGISTRY_PATH = os.path.join(KNOWLEDGE_SOURCE_DIR, "_registry.json")


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
                logger.info(f"知识库 TriviumDB 已打开: {KNOWLEDGE_DB_PATH} (维度: {dim})")
    return _db


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


def _rrf_merge(
    vector_hits: list[dict],
    bm25_hits: list[dict],
    top_k: int = 5,
    vector_weight: float = 0.6,
    bm25_weight: float = 0.4,
    k: int = 60,
) -> list[dict]:
    """RRF (Reciprocal Rank Fusion) 合并向量和 BM25 结果

    公式: rrf_score = Σ (weight / (k + rank))
    每条结果按 (file_id, chunk_index) 去重，保留最高分来源的内容。
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

    # 按 RRF 分数排序
    sorted_keys = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    result = []
    for key in sorted_keys[:top_k]:
        entry = content_map[key].copy()
        entry["rrf_score"] = scores[key]
        result.append(entry)

    return result


def _load_registry() -> Dict[str, Dict]:
    """加载 registry.json（带内存缓存）"""
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                _registry_cache = json.load(f)
        except (json.JSONDecodeError, IOError):
            _registry_cache = {}
    else:
        _registry_cache = {}
    return _registry_cache


def _save_registry(registry: Dict[str, Dict]) -> None:
    """保存 registry.json 并刷新缓存"""
    global _registry_cache
    os.makedirs(KNOWLEDGE_SOURCE_DIR, exist_ok=True)
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    _registry_cache = registry


def _clear_registry_cache() -> None:
    global _registry_cache
    _registry_cache = None


def _generate_file_id() -> str:
    """生成文件ID: kb{timestamp6}{random3}"""
    timestamp = str(int(time.time()))[-6:]
    random_chars = "".join(random.choices(string.ascii_lowercase, k=3))
    return f"kb{timestamp}{random_chars}"


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
        meta = _build_meta(fid, filename, category, subdir, 0, len(content), now)
        _update_registry(fid, meta)
        logger.info(f"知识库导入（空内容）: {fid} ({filename})")
        return meta

    # 3. 批量嵌入
    backend = await get_embedding_service("knowledge")
    vectors = await backend.encode_batch(chunks) if backend else None
    if not vectors:
        raise RuntimeError("Embedding 服务不可用，无法向量化")

    # 4. 存入 TriviumDB
    db = _get_db()
    rel_path = os.path.join(category, subdir, filename) if subdir else os.path.join(category, filename)
    rel_path = rel_path.replace("\\", "/")

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
        db.insert(vector, payload)
    db.flush()

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
    meta = _build_meta(fid, filename, category, subdir, len(chunks), len(content), now)
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
    """混合搜索: 向量 + BM25 → RRF 合并 → PRF 精炼 → 句子级精排"""
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

    # ── Path B: BM25 搜索（知识库 chunks + 主动记忆）──
    bm25_hits = []
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
                seen = {(h.get("file_id", ""), h.get("chunk_index", 0)) for h in bm25_hits}
                for ah in active_hits:
                    key = (ah.get("memory_id", ""), 0)
                    if key not in seen:
                        bm25_hits.append({
                            "file_id": ah.get("memory_id", ""),
                            "source_path": "",
                            "filename": "",
                            "category": f"active_{ah.get('category', 'context')}",
                            "chunk_index": 0,
                            "content": ah.get("content", ""),
                            "bm25_score": ah.get("bm25_score", 0.0),
                        })
                        seen.add(key)
    except Exception as e:
        logger.debug(f"知识库 BM25 搜索跳过: {e}")

    # ── RRF 合并 ──
    hits = _rrf_merge(vector_hits, bm25_hits, top_k=top_k)

    # ── 缓冲区搜索（小模型向量，独立空间）──
    buffer_hits = []
    try:
        from lumen.services.buffer import search as buffer_search, has_data
        if has_data():
            buffer_hits = await buffer_search(query, top_k=max(1, top_k // 2))
    except Exception as e:
        logger.debug(f"缓冲区搜索跳过: {e}")

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
                logger.debug(f"知识库 PRF 精炼: {len(refined_hits)} 条结果")

    # ── 缓冲区结果合并（按分数混排）──
    if buffer_hits:
        for bh in buffer_hits:
            bh["rrf_score"] = bh.get("score", 0.5)
            bh["source"] = "buffer"
        hits.extend(buffer_hits)
        hits.sort(key=lambda h: h.get("rrf_score", h.get("score", 0)), reverse=True)

    # ── 句子级精排 ──
    if KNOWLEDGE_SENTENCE_LEVEL and hits:
        refined = await refine_with_sentences(query, hits)
        return refined

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


def close():
    """关闭 TriviumDB"""
    global _db, _sentence_db
    if _db is not None:
        _db.flush()
        _db = None
        logger.info("知识库 TriviumDB 已关闭")
    if _sentence_db is not None:
        _sentence_db.flush()
        _sentence_db = None
        logger.info("句子级 TriviumDB 已关闭")


async def rebuild_if_empty():
    """启动时检测 knowledge.tdb 是否为空，为空则从源文件自动重建。

    场景：用户换了 embedding API、删除了 TDB 文件、或首次启动。
    扫描 KNOWLEDGE_SOURCE_DIR 下所有 .md/.txt/.markdown 文件，
    跳过 _registry.json 和已有条目的文件，逐个调用 import_file。
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
            if f == "_registry.json":
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


# ── 内部工具 ──


def _build_meta(
    fid: str, filename: str, category: str, subdir: str,
    chunk_count: int, char_count: int, now: str,
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
