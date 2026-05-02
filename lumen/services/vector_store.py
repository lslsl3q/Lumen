"""
Lumen - 向量存储
基于 TriviumDB 的语义搜索，替代 jieba + SQLite LIKE
单文件 .tdb 存储，自动管理向量索引

维度从嵌入服务动态获取，不再硬编码。
"""

import json
import logging
import os
from typing import Optional

import triviumdb

logger = logging.getLogger(__name__)

from lumen.config import VECTOR_LOCAL_DIR

_DATA_DIR = VECTOR_LOCAL_DIR
_DB_PATH = os.path.join(_DATA_DIR, "memory.tdb")

_db: Optional[triviumdb.TriviumDB] = None

_DIM_FILE = _DB_PATH + ".dim"

# v0.6.0 需要建索引的 Payload 字段
_INDEX_FIELDS = ["character_id", "session_id", "owner_id", "type", "status"]


def _get_db() -> triviumdb.TriviumDB:
    """获取 TriviumDB 实例（单例）"""
    global _db
    if _db is None:
        os.makedirs(_DATA_DIR, exist_ok=True)
        from lumen.services.embedding import resolve_dimensions, check_dim_consistency, _save_dim_file
        dim = resolve_dimensions("memory")

        # 维度一致性检查 — 不匹配就报错，不自动修
        err = check_dim_consistency(_DB_PATH, dim)
        if err:
            raise RuntimeError(err)

        _db = triviumdb.TriviumDB(_DB_PATH, dim=dim)
        _save_dim_file(_DB_PATH, dim)

        # v0.6.0 属性二级索引：O(1) 等值过滤
        for field in _INDEX_FIELDS:
            try:
                _db.create_index(field)
            except Exception:
                pass  # 索引已存在则跳过

        logger.info(f"TriviumDB 已打开: {_DB_PATH} (维度: {dim})")
    return _db


def init_with_dimensions(dim: int):
    """用指定维度初始化数据库（供外部精确控制时使用）

    如果数据库已打开，此函数无效。
    """
    global _db
    if _db is not None:
        return
    os.makedirs(_DATA_DIR, exist_ok=True)
    _db = triviumdb.TriviumDB(_DB_PATH, dim=dim)
    logger.info(f"TriviumDB 已打开: {_DB_PATH} (维度: {dim})")


def insert_vector(
    vector: list[float],
    role: str,
    content: str,
    session_id: str,
    character_id: str,
    message_id: int,
    created_at: str = "",
) -> int:
    """插入一条消息向量

    Returns:
        TriviumDB 节点 ID
    """
    db = _get_db()
    node_id = db.insert(
        vector,
        {
            "role": role,
            "content": content[:2000],
            "session_id": session_id,
            "character_id": character_id,
            "message_id": message_id,
            "created_at": created_at,
            "source": "chat",
            "category": "message",
        },
    )
    return node_id


def search_similar(
    query_vector: list[float],
    character_id: str,
    top_k: int = 10,
    min_score: float = 0.4,
    exclude_session_id: str = "",
) -> list[dict]:
    """向量语义搜索

    Args:
        query_vector: 查询向量
        character_id: 角色ID（用于过滤）
        top_k: 返回前 K 个结果
        min_score: 最低相似度阈值
        exclude_session_id: 排除当前会话的消息

    Returns:
        [{"role", "content", "session_id", "created_at", "score"}, ...]
    """
    db = _get_db()
    results = db.search(query_vector, top_k=top_k * 2, min_score=min_score)

    hits = []
    seen = set()
    for hit in results:
        payload = hit.payload if hasattr(hit, "payload") else {}
        # 过滤：只保留同角色的结果
        if payload.get("character_id") != character_id:
            continue
        # 排除当前会话的消息
        if exclude_session_id and payload.get("session_id") == exclude_session_id:
            continue
        # 去重
        key = (payload.get("session_id", ""), payload.get("content", "")[:100])
        if key in seen:
            continue
        seen.add(key)

        hits.append({
            "id": hit.id if hasattr(hit, "id") else None,
            "role": payload.get("role", ""),
            "content": payload.get("content", ""),
            "session_id": payload.get("session_id", ""),
            "created_at": payload.get("created_at", ""),
            "message_id": payload.get("message_id", 0),
            "score": hit.score if hasattr(hit, "score") else 0.0,
        })
        if len(hits) >= top_k:
            break

    return hits


def delete_by_session(session_id: str) -> int:
    """用 TQL 按 session_id 批量删除向量，返回删除数量"""
    db = _get_db()
    result = db.tql_mut(f'MATCH (a {{session_id: {json.dumps(session_id)}}}) DETACH DELETE a')
    db.flush()
    return result.get("affected", 0) if isinstance(result, dict) else 0


def delete_by_character(character_id: str) -> int:
    """用 TQL 按 character_id 批量删除向量，返回删除数量"""
    db = _get_db()
    result = db.tql_mut(f'MATCH (a {{character_id: {json.dumps(character_id)}}}) DETACH DELETE a')
    db.flush()
    return result.get("affected", 0) if isinstance(result, dict) else 0


def prf_refine(query_vector: list[float], search_hits: list[dict],
               alpha: float = 0.7, beta: float = 0.3) -> list[float] | None:
    """PRF (Pseudo-Relevance Feedback) 查询向量精炼

    Rocchio 公式：refined = α·query + β·centroid(top_hits)
    从 TriviumDB 读回已存向量算均值，零嵌入开销。

    Args:
        query_vector: 原始查询向量
        search_hits: 第一次搜索的结果列表（需要有 id 或 node_id）
        alpha: 原始查询权重（默认 0.7）
        beta: PRF 反馈权重（默认 0.3）

    Returns:
        精炼后的查询向量，失败返回 None
    """
    from lumen.config import PRF_TOP_N
    db = _get_db()
    if db is None:
        return None

    top_n = search_hits[:PRF_TOP_N]
    if not top_n:
        return None

    # 从 TriviumDB 读回 top-N 的存储向量
    vectors = []
    for hit in top_n:
        node_id = hit.get("id") or hit.get("node_id")
        if node_id is None:
            continue
        try:
            node = db.get(node_id)
            if node and hasattr(node, "vector") and node.vector:
                vectors.append(node.vector)
        except Exception:
            continue

    if not vectors:
        return None

    # centroid = 向量均值
    dim = len(vectors[0])
    centroid = [0.0] * dim
    for vec in vectors:
        for i in range(dim):
            centroid[i] += vec[i]
    for i in range(dim):
        centroid[i] /= len(vectors)

    # Rocchio: refined = α·query + β·centroid
    refined = [alpha * query_vector[i] + beta * centroid[i] for i in range(dim)]

    # 归一化（cosine similarity 不受向量长度影响）
    norm = sum(x * x for x in refined) ** 0.5
    if norm > 0:
        refined = [x / norm for x in refined]

    logger.debug(f"PRF 精炼: {len(vectors)} 条反馈向量, α={alpha}, β={beta}")
    return refined


def flush():
    """持久化数据到磁盘"""
    global _db
    if _db is not None:
        _db.flush()
        logger.info("TriviumDB 数据已持久化")


def close():
    """关闭数据库"""
    global _db
    if _db is not None:
        flush()
        _db = None
        logger.info("TriviumDB 已关闭")
