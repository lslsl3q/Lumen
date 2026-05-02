"""
图谱备份与恢复服务

职责：将图谱实体+边导出为 JSON，重建后自动恢复
存储：lumen/data/graph/{tdb_name}.json（数据库无关格式）
"""

import os
import json
import logging
import subprocess
from datetime import datetime
from typing import Optional

from lumen.config import GRAPH_BACKUP_DIR

logger = logging.getLogger(__name__)

BACKUP_VERSION = 1


def _get_tdb(tdb_name: str):
    """根据名称获取 TDB 实例（与 graph route 共用逻辑）"""
    if tdb_name == "knowledge":
        from lumen.services.knowledge import _get_db
        return _get_db()
    elif tdb_name == "memory":
        from lumen.services.vector_store import _get_db
        return _get_db()
    else:
        raise ValueError(f"未知 TDB: {tdb_name}")


def get_backup_path(tdb_name: str) -> str:
    """返回备份 JSON 文件路径"""
    return os.path.join(GRAPH_BACKUP_DIR, f"{tdb_name}.json")


def save_graph(tdb_name: str) -> Optional[str]:
    """从 TDB 读取所有图谱实体+边，导出为 JSON

    Returns:
        备份文件路径，失败返回 None
    """
    try:
        db = _get_tdb(tdb_name)
    except Exception as e:
        logger.warning(f"获取 TDB 失败，跳过图谱备份: {e}")
        return None

    entities = []
    edges = []
    seen_edges = set()

    # 收集所有图谱实体（有 name + type 的节点）
    for nid in db.all_node_ids():
        try:
            node = db.get(nid)
        except Exception:
            continue
        if not node:
            continue
        payload = node.payload if hasattr(node, "payload") else {}
        if "name" not in payload or "type" not in payload:
            continue

        name = payload["name"]
        entity_type = payload["type"]
        extra = {k: v for k, v in payload.items() if k not in ("name", "type")}
        entities.append({"name": name, "type": entity_type, "extra": extra})

        # 收集该实体的边
        try:
            neighbors = db.neighbors(nid, depth=1)
        except Exception:
            continue
        for dst_id in neighbors:
            edge_key = (nid, dst_id)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)

            try:
                dst_node = db.get(dst_id)
            except Exception:
                continue
            if not dst_node:
                continue
            dst_payload = dst_node.payload if hasattr(dst_node, "payload") else {}
            dst_name = dst_payload.get("name")
            if not dst_name:
                continue

            edges.append({
                "src_name": name,
                "dst_name": dst_name,
                "label": "related",
                "weight": 1.0,
            })

    # 写入 JSON
    os.makedirs(GRAPH_BACKUP_DIR, exist_ok=True)
    backup = {
        "version": BACKUP_VERSION,
        "tdb": tdb_name,
        "saved_at": datetime.now().isoformat(),
        "entities": entities,
        "edges": edges,
    }

    path = get_backup_path(tdb_name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)

    logger.info(f"图谱备份已保存: {path} ({len(entities)} 实体, {len(edges)} 边)")
    return path


def restore_graph(tdb_name: str) -> int:
    """从 JSON 恢复图谱实体+边到 TDB

    Returns:
        恢复的实体数量，无需恢复返回 0
    """
    path = get_backup_path(tdb_name)
    if not os.path.isfile(path):
        logger.info(f"无图谱备份文件: {path}")
        return 0

    try:
        with open(path, "r", encoding="utf-8") as f:
            backup = json.load(f)
    except Exception as e:
        logger.warning(f"读取图谱备份失败: {e}")
        return 0

    entities = backup.get("entities", [])
    edges = backup.get("edges", [])
    if not entities:
        return 0

    try:
        db = _get_tdb(tdb_name)
    except Exception as e:
        logger.warning(f"获取 TDB 失败，跳过图谱恢复: {e}")
        return 0

    from lumen.services.embedding import resolve_dimensions
    import random

    dim = resolve_dimensions(tdb_name)

    # 恢复实体（name → node_id 映射）
    name_to_id = {}
    for ent in entities:
        name = ent["name"]
        entity_type = ent.get("type", "entity")
        extra = ent.get("extra", {})

        payload = {"name": name, "type": entity_type, **extra}
        vector = [random.gauss(0, 0.01) for _ in range(dim)]
        node_id = db.insert(vector, payload)
        name_to_id[name] = node_id

    # 恢复边
    for edge in edges:
        src_id = name_to_id.get(edge["src_name"])
        dst_id = name_to_id.get(edge["dst_name"])
        if src_id and dst_id:
            try:
                db.link(src_id, dst_id, label=edge.get("label", "related"), weight=edge.get("weight", 1.0))
            except Exception:
                pass

    db.flush()
    logger.info(f"图谱已恢复: {len(entities)} 实体, {len(edges)} 边 → {tdb_name}")
    return len(entities)


def auto_git_commit(message: str = "图谱备份更新") -> bool:
    """在 graph 备份目录执行 git add + commit（本地仓库，无 remote）"""
    git_dir = os.path.join(GRAPH_BACKUP_DIR, ".git")
    if not os.path.isdir(git_dir):
        return False

    try:
        subprocess.run(
            ["git", "add", "-A"],
            cwd=GRAPH_BACKUP_DIR,
            capture_output=True,
            timeout=10,
        )
        result = subprocess.run(
            ["git", "commit", "-m", message, "--allow-empty"],
            cwd=GRAPH_BACKUP_DIR,
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except Exception as e:
        logger.debug(f"Git 自动提交跳过: {e}")
        return False
