"""
Lumen - 向量存储
基于 TriviumDB 的语义搜索，替代 jieba + SQLite LIKE
单文件 .tdb 存储，自动管理向量索引
"""

import logging
import os
from typing import Optional

import triviumdb

from lumen.config import EMBEDDING_DIMENSIONS

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_DB_PATH = os.path.join(_DATA_DIR, "memory.tdb")

_db: Optional[triviumdb.TriviumDB] = None


def _get_db() -> triviumdb.TriviumDB:
    """获取 TriviumDB 实例（单例，首次调用时创建）"""
    global _db
    if _db is None:
        os.makedirs(_DATA_DIR, exist_ok=True)
        _db = triviumdb.TriviumDB(_DB_PATH, dim=EMBEDDING_DIMENSIONS)
        logger.info(f"TriviumDB 已打开: {_DB_PATH}")
    return _db


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
        },
    )
    return node_id


def search_similar(
    query_vector: list[float],
    character_id: str,
    top_k: int = 10,
    min_score: float = 0.4,
) -> list[dict]:
    """向量语义搜索

    Args:
        query_vector: 查询向量
        character_id: 角色ID（用于过滤）
        top_k: 返回前 K 个结果
        min_score: 最低相似度阈值

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
        # 去重
        key = (payload.get("session_id", ""), payload.get("content", "")[:100])
        if key in seen:
            continue
        seen.add(key)

        hits.append({
            "role": payload.get("role", ""),
            "content": payload.get("content", ""),
            "session_id": payload.get("session_id", ""),
            "created_at": payload.get("created_at", ""),
            "score": hit.score if hasattr(hit, "score") else 0.0,
        })
        if len(hits) >= top_k:
            break

    return hits


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
