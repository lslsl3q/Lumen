"""
EpisodeNode CRUD — 图谱事件节点管理

Episode 是内容入库的中间层：文件/梦境/反思等内容的每一段落
先成为 Episode 节点（pending），提取实体/关系后 commit（active），
失败则 rollback（deleted）。

状态机：pending → active | deleted
         active → superseded（被新 Episode 替代）
"""

import time
import logging
from typing import Optional, List

from lumen.services.graph._core import _get_tdb, _tql_escape

logger = logging.getLogger(__name__)


def create_episode(
    content: str,
    source_path: str,
    source_doc_id: Optional[str] = None,
    source_type: str = "file_chunk",
    valid_at: Optional[float] = None,
    content_embedding: Optional[list] = None,
    tdb_name: str = "knowledge",
) -> int:
    """创建 Episode 节点

    Args:
        content: 段落/切片文本内容
        source_path: 来源文件路径（用于 ACL 隔离）
        source_doc_id: 来源文档 ID（外键关联）
        source_type: 来源类型 — file_chunk | dream | reflection | manual
        valid_at: 内容生效时间戳，默认当前时间
        content_embedding: 内容向量，为 None 时使用零向量占位
        tdb_name: TDB 实例名

    Returns:
        Episode 节点 ID（int）
    """
    db = _get_tdb(tdb_name)

    now = time.time()
    payload = {
        "type": "episode",
        "content": content,
        "source_path": source_path,
        "source_doc_id": source_doc_id,
        "source_type": source_type,
        "valid_at": valid_at if valid_at is not None else now,
        "created_at": now,
        "status": "pending",
    }

    if content_embedding is not None:
        vector = content_embedding
    else:
        dim = db.dim()
        vector = [0.0] * dim

    ep_id = db.insert(vector, payload)
    db.index_text(ep_id, content)
    db.flush()

    logger.info(
        f"Episode 已创建: id={ep_id}, source={source_path}, type={source_type}"
    )
    return ep_id


def commit_episode(ep_id: int, tdb_name: str = "knowledge") -> bool:
    """将 Episode 状态从 pending 更新为 active

    Args:
        ep_id: Episode 节点 ID
        tdb_name: TDB 实例名

    Returns:
        True 成功，False 失败（节点不存在或状态不允许）
    """
    db = _get_tdb(tdb_name)

    payload = db.get_payload(ep_id)
    if payload is None:
        logger.warning(f"commit_episode: Episode {ep_id} 不存在")
        return False

    current_status = payload.get("status", "")
    if current_status != "pending":
        logger.warning(
            f"commit_episode: Episode {ep_id} 状态为 {current_status}，"
            f"无法 commit（需 pending）"
        )
        return False

    payload["status"] = "active"
    db.update_payload(ep_id, payload)
    db.flush()

    logger.info(f"Episode 已提交: id={ep_id}")
    return True


def rollback_episode(ep_id: int, tdb_name: str = "knowledge") -> bool:
    """将 Episode 状态标记为 deleted（回滚）

    Args:
        ep_id: Episode 节点 ID
        tdb_name: TDB 实例名

    Returns:
        True 成功，False 失败（节点不存在）
    """
    db = _get_tdb(tdb_name)

    payload = db.get_payload(ep_id)
    if payload is None:
        logger.warning(f"rollback_episode: Episode {ep_id} 不存在")
        return False

    payload["status"] = "deleted"
    db.update_payload(ep_id, payload)
    db.flush()

    logger.info(f"Episode 已回滚: id={ep_id}")
    return True


def get_episode(ep_id: int, tdb_name: str = "knowledge") -> Optional[dict]:
    """获取 Episode 的 payload

    Args:
        ep_id: Episode 节点 ID
        tdb_name: TDB 实例名

    Returns:
        payload 字典，不存在则返回 None
    """
    db = _get_tdb(tdb_name)
    return db.get_payload(ep_id)


def find_episodes_by_doc(
    source_doc_id: str, tdb_name: str = "knowledge"
) -> List[int]:
    """按 source_doc_id 查找所有关联的 Episode

    Args:
        source_doc_id: 来源文档 ID
        tdb_name: TDB 实例名

    Returns:
        Episode ID 列表
    """
    if not source_doc_id:
        return []
    db = _get_tdb(tdb_name)
    try:
        safe = _tql_escape(source_doc_id)
        rows = db.tql(f'FIND {{type: "episode", source_doc_id: "{safe}"}} RETURN *')
        ids = []
        for row in rows:
            node = row.row.get("_")
            if node and "id" in node:
                ids.append(node["id"])
        return ids
    except Exception as e:
        logger.warning(f"find_episodes_by_doc 查询失败 ({source_doc_id}): {e}")
        return []


def find_episodes_by_source_path(
    source_path: str, tdb_name: str = "knowledge"
) -> List[int]:
    """按 source_path 查找所有关联的 Episode（ACL 隔离查询）

    Args:
        source_path: 来源文件路径
        tdb_name: TDB 实例名

    Returns:
        Episode ID 列表
    """
    if not source_path:
        return []
    db = _get_tdb(tdb_name)
    try:
        safe = _tql_escape(source_path)
        rows = db.tql(f'FIND {{type: "episode", source_path: "{safe}"}} RETURN *')
        ids = []
        for row in rows:
            node = row.row.get("_")
            if node and "id" in node:
                ids.append(node["id"])
        return ids
    except Exception as e:
        logger.warning(
            f"find_episodes_by_source_path 查询失败 ({source_path}): {e}"
        )
        return []
