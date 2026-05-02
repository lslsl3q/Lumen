"""
稀疏向量存储服务
SQLite 存储 + In-memory 缓存 + Dot Product 搜索
复用 history.db，与 history.py 共享连接
"""

import json
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# ── In-memory 缓存（单进程安全）──
_cache: dict[int, dict[int, float]] = {}   # node_id → {index: value}
_cache_meta: dict[int, dict] = {}           # node_id → {file_id, chunk_index, category}
_cache_loaded = False
_cache_lock = threading.Lock()


def _ensure_table():
    """确保 sparse_vectors 表存在"""
    from lumen.services.history import _get_conn
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sparse_vectors (
            node_id INTEGER PRIMARY KEY,
            file_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            category TEXT DEFAULT '',
            sparse_data TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sv_file ON sparse_vectors(file_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sv_cat ON sparse_vectors(category)")
    conn.commit()


def _parse_sparse(raw) -> dict[int, float]:
    """解析 API 返回的稀疏向量为 {index: value} 字典

    兼容两种格式：
    - list: [{"index": 1, "value": 0.088}, ...]
    - dict: {"1": 0.088, "492": 0.15, ...}
    """
    if isinstance(raw, dict):
        return {int(k): float(v) for k, v in raw.items()}
    if isinstance(raw, list):
        return {int(e["index"]): float(e["value"]) for e in raw}
    return {}


def _ensure_cache():
    """首次搜索时从 SQLite 加载全部稀疏向量到内存"""
    global _cache, _cache_meta, _cache_loaded
    if _cache_loaded:
        return

    with _cache_lock:
        if _cache_loaded:
            return

        _ensure_table()
        from lumen.services.history import _get_conn
        conn = _get_conn()
        rows = conn.execute(
            "SELECT node_id, file_id, chunk_index, category, sparse_data FROM sparse_vectors"
        ).fetchall()

        for row in rows:
            parsed = _parse_sparse(json.loads(row["sparse_data"]))
            if parsed:
                _cache[row["node_id"]] = parsed
                _cache_meta[row["node_id"]] = {
                    "file_id": row["file_id"],
                    "chunk_index": row["chunk_index"],
                    "category": row["category"],
                }

        _cache_loaded = True
        if _cache:
            logger.info(f"稀疏向量缓存已加载: {len(_cache)} 条")


def has_sparse_data() -> bool:
    """是否有稀疏向量数据（决定是否 fallback 到 BM25）"""
    _ensure_cache()
    return len(_cache) > 0


def save_sparse_batch(items: list[dict]):
    """批量写入稀疏向量

    Args:
        items: [{"node_id", "file_id", "chunk_index", "category", "sparse_data"}]
               sparse_data 是 API 原始返回（list 或 dict）
    """
    if not items:
        return

    _ensure_table()
    from lumen.services.history import _get_conn

    with _cache_lock:
        conn = _get_conn()
        for item in items:
            raw = item["sparse_data"]
            json_str = json.dumps(raw, ensure_ascii=False)
            conn.execute(
                """INSERT OR REPLACE INTO sparse_vectors
                   (node_id, file_id, chunk_index, category, sparse_data)
                   VALUES (?, ?, ?, ?, ?)""",
                (item["node_id"], item["file_id"], item["chunk_index"],
                 item["category"], json_str),
            )
            # 同步更新内存缓存
            parsed = _parse_sparse(raw)
            if parsed:
                _cache[item["node_id"]] = parsed
                _cache_meta[item["node_id"]] = {
                    "file_id": item["file_id"],
                    "chunk_index": item["chunk_index"],
                    "category": item["category"],
                }
        conn.commit()

    logger.info(f"稀疏向量写入: {len(items)} 条")


def search_sparse(
    query_sparse: list[dict] | dict,
    category: str = "",
    top_k: int = 5,
) -> list[dict]:
    """用 Dot Product 搜索最相似的稀疏向量

    Args:
        query_sparse: API 返回的稀疏向量（list 或 dict 格式）
        category: 按分类过滤（空不过滤）
        top_k: 返回条数

    Returns:
        [{"file_id", "chunk_index", "content_from_meta", "score"}, ...]
    """
    _ensure_cache()
    query_dict = _parse_sparse(query_sparse)
    if not query_dict:
        return []

    # Dot Product 计算
    scored = []
    for node_id, doc_dict in _cache.items():
        meta = _cache_meta.get(node_id, {})
        if category and meta.get("category") != category:
            continue

        common = query_dict.keys() & doc_dict.keys()
        if not common:
            continue
        score = sum(query_dict[k] * doc_dict[k] for k in common)
        scored.append((node_id, score, meta))

    # 按 score 降序
    scored.sort(key=lambda x: x[1], reverse=True)

    results = []
    for node_id, score, meta in scored[:top_k]:
        results.append({
            "file_id": meta.get("file_id", ""),
            "source_path": "",
            "filename": "",
            "chunk_index": meta.get("chunk_index", 0),
            "content": "",
            "score": score,
        })

    return results


def delete_by_file(file_id: str):
    """删除指定文件的所有稀疏向量"""
    _ensure_table()
    from lumen.services.history import _get_conn

    with _cache_lock:
        conn = _get_conn()
        conn.execute("DELETE FROM sparse_vectors WHERE file_id = ?", (file_id,))
        conn.commit()

        # 同步清理内存缓存
        to_remove = [nid for nid, meta in _cache_meta.items()
                     if meta.get("file_id") == file_id]
        for nid in to_remove:
            _cache.pop(nid, None)
            _cache_meta.pop(nid, None)

    if to_remove:
        logger.info(f"稀疏向量清理: file_id={file_id}, {len(to_remove)} 条")


def clear_cache():
    """清空内存缓存（测试用）"""
    global _cache, _cache_meta, _cache_loaded
    with _cache_lock:
        _cache.clear()
        _cache_meta.clear()
        _cache_loaded = False
