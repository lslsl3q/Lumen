"""
T19 图谱核心服务
实体 Upsert / 边管理 / 邻居召回（在 TriviumDB 之上）
"""

import logging
from typing import Optional

from lumen.services import history

logger = logging.getLogger(__name__)


def _get_tdb(tdb_name: str):
    """根据名称获取 TDB 实例（复用 graph_backup 模式）"""
    if tdb_name == "knowledge":
        from lumen.services.knowledge import _get_db
        return _get_db()
    elif tdb_name == "memory":
        from lumen.services.vector_store import _get_db
        return _get_db()
    else:
        raise ValueError(f"未知 TDB: {tdb_name}")


def _normalize_name(name: str) -> str:
    """名称归一化：strip + 小写 + 去空格，用于精确去重"""
    return name.strip().lower().replace(" ", "")


def find_entity_by_name(tdb_name: str, name: str, owner_id: str = "") -> Optional[int]:
    """按归一化名称精确查找实体，返回 node_id 或 None

    owner_id 已弃用（保留参数签名兼容），内部通过 name_normalized 查找。
    """
    db = _get_tdb(tdb_name)
    normalized = _normalize_name(name)
    try:
        nodes = db.filter_where({"type": "entity", "name_normalized": normalized})
        for node in nodes:
            return node.id
    except Exception as e:
        logger.warning(f"filter_where 查找实体失败 ({name}): {e}")
    return None


def upsert_entity(tdb_name: str, name: str, entity_type: str,
                  owner_id: str = "", aliases: list = None,
                  extra: dict = None) -> int:
    """创建或更新图谱实体，返回 node_id

    基于 name_normalized 精确去重：
    1. filter_where({"name_normalized": ...}) 查已有实体
    2. 找到 → 直接返回（实体现在是最小化模型，无需合并）
    3. 未找到 → insert（Phase 1 零向量 + 最小化 payload）

    owner_id 和 extra 已弃用（保留参数签名兼容）。
    """
    db = _get_tdb(tdb_name)
    normalized = _normalize_name(name)

    existing_id = find_entity_by_name(tdb_name, name)
    if existing_id is not None:
        logger.debug(f"图谱实体已存在: {name} (id={existing_id})")
        return existing_id

    # Phase 1: 零向量占位（后续接入 embedding 服务后替换为名称嵌入）
    dim = db.dim()
    vector = [0.0] * dim
    payload = {
        "name": name,
        "name_normalized": normalized,
        "type": "entity",
        "entity_type": entity_type,
        "aliases": aliases or [],
        "source_folders": [],
    }
    node_id = db.insert(vector, payload)
    db.flush()
    logger.debug(f"图谱实体已创建: {name} (id={node_id}, type={entity_type})")
    return node_id


def update_source_folders(entity_id: int, folder: str, action: str = "add",
                          tdb_name: str = "knowledge") -> None:
    """维护实体的 source_folders 列表（记录哪些文件夹提及了该实体）

    Args:
        entity_id: 实体 node_id
        folder: 文件夹路径
        action: "add" 添加 | "remove" 移除
        tdb_name: TDB 实例名
    """
    db = _get_tdb(tdb_name)
    node = db.get(entity_id)
    if not node:
        logger.warning(f"update_source_folders: 实体不存在 (id={entity_id})")
        return

    payload = node.payload if hasattr(node, "payload") else {}
    folders = set(payload.get("source_folders", []))

    if action == "add":
        folders.add(folder)
    elif action == "remove":
        folders.discard(folder)
    else:
        logger.warning(f"update_source_folders: 未知 action={action}")
        return

    payload["source_folders"] = list(folders)
    db.update_payload(entity_id, payload)
    db.flush()


def upsert_edge(tdb_name: str, src_id: int, dst_id: int, label: str = "related",
                weight: float = 1.0, source_episode_id: str = "",
                owner_id: str = "") -> dict:
    """创建边（TriviumDB link + SQLite 元数据）"""
    db = _get_tdb(tdb_name)
    try:
        db.link(src_id, dst_id, label=label, weight=weight)
        db.flush()
    except Exception as e:
        logger.debug(f"TriviumDB link 失败 ({src_id}->{dst_id}): {e}")
        return {"created": False, "error": str(e)}

    history.save_edge_meta(
        tdb=tdb_name, src_id=src_id, dst_id=dst_id, label=label,
        source_episode_id=source_episode_id, owner_id=owner_id,
    )
    return {"created": True, "src": src_id, "dst": dst_id, "label": label}


def batch_upsert(tdb_name: str, entities: list[dict], edges: list[dict],
                 source_episode_id: str = "", owner_id: str = "") -> dict:
    """批量处理一次 LLM 提取结果

    Args:
        entities: [{"name": "张教授", "type": "Character", "aliases": ["..."], "extra": {}}, ...]
        edges: [{"src_name": "张教授", "dst_name": "北京", "label": "lives_in"}, ...]

    Returns:
        {"entities_created": N, "edges_created": N}
    """
    name_to_id = {}
    entities_created = 0

    for ent in entities:
        name = ent.get("name", "").strip()
        if not name:
            continue
        etype = ent.get("type", "Concept")
        if etype not in ("Character", "Location", "Item", "Organization", "Event", "Concept"):
            etype = "Concept"
        node_id = upsert_entity(
            tdb_name, name, etype,
            owner_id=owner_id,
            aliases=ent.get("aliases", []),
            extra=ent.get("extra", {}),
        )
        name_to_id[name] = node_id
        entities_created += 1

    edges_created = 0
    for edge in edges:
        src_name = edge.get("src_name", "").strip()
        dst_name = edge.get("dst_name", "").strip()
        if not src_name or not dst_name:
            continue
        # 可能创建了同名变体（别名），优先用已有映射，没有则按 name 查找
        src_id = name_to_id.get(src_name)
        if not src_id:
            src_id = find_entity_by_name(tdb_name, src_name, owner_id)
        dst_id = name_to_id.get(dst_name)
        if not dst_id:
            dst_id = find_entity_by_name(tdb_name, dst_name, owner_id)

        if src_id and dst_id:
            result = upsert_edge(
                tdb_name, src_id, dst_id,
                label=edge.get("label", "related"),
                source_episode_id=source_episode_id,
                owner_id=owner_id,
            )
            if result["created"]:
                edges_created += 1

    if entities_created or edges_created:
        logger.info(f"图谱批量更新: {entities_created} 实体, {edges_created} 边 ({tdb_name})")

    return {"entities_created": entities_created, "edges_created": edges_created}


def get_entity_neighbors_text(tdb_name: str, entity_ids: list[int],
                              owner_id: str = "") -> list[str]:
    """图谱召回：给定锚实体 ID → 取 1-Hop 邻居 → 序列化为文本片段

    输出格式：["张教授 害怕 蜘蛛", "Eric 住在 北京"]
    """
    db = _get_tdb(tdb_name)
    snippets = []
    seen_pairs = set()

    for entity_id in entity_ids:
        try:
            src_node = db.get(entity_id)
        except Exception:
            continue
        if not src_node:
            continue
        src_payload = src_node.payload if hasattr(src_node, "payload") else {}
        src_name = src_payload.get("name", "")
        if not src_name:
            continue

        try:
            neighbor_ids = db.neighbors(entity_id, depth=1)
        except Exception:
            continue

        for dst_id in neighbor_ids:
            pair_key = (min(entity_id, dst_id), max(entity_id, dst_id))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            try:
                dst_node = db.get(dst_id)
            except Exception:
                continue
            if not dst_node:
                continue
            dst_payload = dst_node.payload if hasattr(dst_node, "payload") else {}
            dst_name = dst_payload.get("name", "")
            if not dst_name:
                continue

            if owner_id:
                src_owner = src_payload.get("owner_id", "")
                dst_owner = dst_payload.get("owner_id", "")
                if src_owner and src_owner != owner_id:
                    continue
                if dst_owner and dst_owner != owner_id:
                    continue

            # 取边 label（从 SQLite 元数据）
            meta = history.get_edge_meta(tdb_name, entity_id, dst_id)
            label = meta.get("label", "related") if meta else "related"

            snippet = f"{src_name} {label} {dst_name}"
            snippets.append(snippet)

    return snippets
