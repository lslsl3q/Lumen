"""
T19 图谱核心服务
实体 Upsert / 边管理 / 邻居召回（在 TriviumDB 之上）
"""

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


def _get_tdb(tdb_name: str):
    """根据名称获取 TDB 实例（统一走 tdb_registry）"""
    from lumen.services.tdb_registry import get_tdb
    return get_tdb(tdb_name)


def _normalize_name(name: str) -> str:
    """名称归一化：strip + 小写 + 去空格，用于精确去重"""
    return name.strip().lower().replace(" ", "")


def _tql_escape(value: str) -> str:
    """转义 TQL 字符串值中的特殊字符，防止注入"""
    return (value
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t"))


def find_entity_by_name(tdb_name: str, name: str) -> Optional[int]:
    """按归一化名称精确查找实体，返回 node_id 或 None"""
    if not name or not name.strip():
        return None
    db = _get_tdb(tdb_name)
    normalized = _normalize_name(name)
    safe = _tql_escape(normalized)
    try:
        rows = db.tql(f'FIND {{type: "entity", name_normalized: "{safe}"}} RETURN *')
        for row in rows:
            node = row.row.get("_")
            if node and "id" in node:
                return node["id"]
    except Exception as e:
        logger.warning(f"TQL 查找实体失败 ({name}): {e}")
    return None


def upsert_entity(tdb_name: str, name: str, entity_type: str,
                  aliases: list = None, vector: list | None = None) -> int:
    """创建或更新图谱实体，返回 node_id

    基于 name_normalized 精确去重：
    1. TQL FIND {name_normalized: ...} 查已有实体
    2. 找到 → 直接返回（实体现在是最小化模型，无需合并）
    3. 未找到 → insert（Phase 1 零向量 + 最小化 payload）
    """
    db = _get_tdb(tdb_name)
    normalized = _normalize_name(name)

    existing_id = find_entity_by_name(tdb_name, name)
    if existing_id is not None:
        logger.debug(f"图谱实体已存在: {name} (id={existing_id})")
        return existing_id

    # 向量：优先用预计算的，否则零向量
    dim = db.dim()
    entity_vector = vector if vector is not None else [0.0] * dim
    payload = {
        "name": name,
        "name_normalized": normalized,
        "type": "entity",
        "entity_type": entity_type,
        "aliases": aliases or [],
        "source_folders": [],
    }
    node_id = db.insert(entity_vector, payload)
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
    payload = db.get_payload(entity_id)
    if not payload:
        logger.warning(f"update_source_folders: 实体不存在 (id={entity_id})")
        return
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


def upsert_edge(
    tdb_name: str,
    source_name: str = "",
    target_name: str = "",
    label: str = "related",
    fact: str = "",
    source_path: str = "",
    episode_id: int = 0,
    valid_at: float = None,
    invalid_at: float = None,
) -> int:
    """创建边：edge 作为 TriviumDB NODE 存储 + 多条 graph link

    1. upsert source/target 实体
    2. 创建 edge NODE（payload 含 type/source_name/target_name/label/fact/source_path/episode_ids/timestamps）
    3. link: episode→edge (SUPPORTS), source→target (RELATES_TO), episode→source (MENTIONS), episode→target (MENTIONS)
    4. 更新 source/target 实体的 source_folders
    """
    db = _get_tdb(tdb_name)

    if not source_name or not target_name:
        logger.warning("upsert_edge: 需要 source_name 和 target_name")
        return 0

    now = time.time()

    # 1. upsert source/target 实体
    source_id = upsert_entity(tdb_name, source_name, "Concept")
    target_id = upsert_entity(tdb_name, target_name, "Concept")

    # 2. 创建 edge NODE（Phase 1 零向量）
    dim = db.dim()
    vector = [0.0] * dim
    payload = {
        "type": "edge",
        "source_name": source_name,
        "target_name": target_name,
        "label": label,
        "fact": fact or label,
        "source_path": source_path,
        "episode_ids": [episode_id] if episode_id else [],
        "valid_at": valid_at if valid_at is not None else now,
        "invalid_at": invalid_at,
        "reference_time": now,
    }
    edge_id = db.insert(vector, payload)

    # 3. index fact text for text hybrid search
    fact_text = fact or label
    if fact_text:
        try:
            db.index_text(edge_id, fact_text)
        except Exception as e:
            logger.debug(f"index_text 失败 (edge {edge_id}): {e}")

    # 4. graph links
    if episode_id:
        try:
            db.link(episode_id, edge_id, "SUPPORTS", 1.0)
            db.link(episode_id, source_id, "MENTIONS", 1.0)
            db.link(episode_id, target_id, "MENTIONS", 1.0)
        except Exception as e:
            logger.debug(f"graph link 失败 (episode links): {e}")

    try:
        db.link(source_id, target_id, "RELATES_TO", 1.0)
    except Exception as e:
        logger.debug(f"graph link 失败 (RELATES_TO {source_id}->{target_id}): {e}")

    db.flush()

    # 5. 更新 source_folders
    if source_path:
        update_source_folders(source_id, source_path, "add", tdb_name)
        update_source_folders(target_id, source_path, "add", tdb_name)

    logger.debug(
        f"边已创建: " + source_name + " -[" + label + "]-> " + target_name + " "
        f"(edge_id={edge_id}, source_path={source_path})"
    )
    return edge_id


def batch_upsert(tdb_name: str, entities: list[dict], edges: list[dict],
                 source_path: str = "", episode_id: int = 0) -> dict:
    """批量处理一次 LLM 提取结果

    Args:
        entities: [{"name": "张教授", "type": "Character", "aliases": ["..."], "extra": {}}, ...]
        edges: [{"src_name": "张教授", "dst_name": "北京", "label": "lives_in"}, ...]
        source_path: 来源文件夹路径（用于 ACL 隔离）
        episode_id: 来源 episode 的 node_id（用于 graph link）

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
        # 去重已解析 → 复用已有实体
        if ent.get("_resolved") and ent.get("_existing_id"):
            name_to_id[name] = ent["_existing_id"]
            continue
        node_id = upsert_entity(
            tdb_name, name, etype,
            aliases=ent.get("aliases", []),
            vector=ent.get("_vector"),
        )
        name_to_id[name] = node_id
        entities_created += 1
        # 增量更新去重索引
        try:
            from lumen.services.graph.dedup import get_entity_index
            idx = get_entity_index(tdb_name)
            idx.add(node_id, _normalize_name(name), ent.get("aliases", []))
        except Exception:
            pass

    edges_created = 0
    for edge in edges:
        # 支持多种字段命名: src_name/dst_name 或 source/target
        src_name = edge.get("src_name", edge.get("source", "")).strip()
        dst_name = edge.get("dst_name", edge.get("target", "")).strip()
        if not src_name or not dst_name:
            continue

        edge_label = edge.get("label", edge.get("relation", "related"))
        fact_text = edge.get("fact", edge.get("label", ""))

        # 边去重：合并 episode_ids 到已有边
        if edge.get("_duplicate_of"):
            old_id = edge["_duplicate_of"]
            db = _get_tdb(tdb_name)
            merged_episodes = edge.get("_merged_episode_ids", [])
            if episode_id and episode_id not in merged_episodes:
                merged_episodes.append(episode_id)
            payload = db.get_payload(old_id)
            if payload:
                payload["episode_ids"] = merged_episodes
                db.update_payload(old_id, payload)
            continue

        edge_id = upsert_edge(
            tdb_name,
            source_name=src_name,
            target_name=dst_name,
            label=edge_label,
            fact=fact_text,
            source_path=source_path,
            episode_id=episode_id,
            valid_at=edge.get("valid_at"),
            invalid_at=edge.get("invalid_at"),
        )
        if edge_id:
            edges_created += 1

    if entities_created or edges_created:
        logger.info(f"图谱批量更新: {entities_created} 实体, {edges_created} 边 ({tdb_name})")

    return {"entities_created": entities_created, "edges_created": edges_created}


def get_entity_neighbors_text(tdb_name: str, entity_ids: list[int]) -> list[str]:
    """图谱召回：给定锚实体 ID → 取 1-Hop 邻居 → 序列化为文本片段

    输出格式：["张教授 害怕 蜘蛛", "Eric 住在 北京"]
    """
    db = _get_tdb(tdb_name)
    snippets = []
    seen_pairs = set()

    for entity_id in entity_ids:
        try:
            src_payload = db.get_payload(entity_id)
        except Exception:
            continue
        if not src_payload:
            continue
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
                dst_payload = db.get_payload(dst_id)
            except Exception:
                continue
            if not dst_payload:
                continue
            dst_name = dst_payload.get("name", "")
            if not dst_name:
                continue

            # 取边 label（从 edge payload 或回退到 "related"）
            dst_type = dst_payload.get("type", "")
            if dst_type == "edge":
                continue
            label = "related"

            snippet = f"{src_name} {label} {dst_name}"
            snippets.append(snippet)

    return snippets
