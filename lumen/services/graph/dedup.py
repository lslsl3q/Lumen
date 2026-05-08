"""图谱去重 — 三阶段实体去重 + 边矛盾检测

Phase 1: 精确匹配（name_normalized + alias 字典，O(1)）
Phase 2: 向量 Top-K 召回（无阈值，取 Top-K 候选给 LLM）
Phase 3: LLM 裁决（最终判断实体同一性）
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class EntityIndex:
    """实体去重索引：精确匹配表（含 alias）

    向量 Top-K 召回直接走 TriviumDB 向量搜索，不需要内存索引。

    线程安全：设计用于单线程 async（协作调度），不保护多线程并发。
    如需多线程访问，调用方需自行加锁。
    """

    def __init__(self):
        # name_normalized → entity_id（含 alias 映射）
        self.exact_map: dict[str, int] = {}

    def add(self, entity_id: int, name_normalized: str,
            aliases: list[str] | None = None):
        """向索引添加一个已有实体，同时索引别名"""
        from lumen.services.graph._core import _normalize_name

        self.exact_map[name_normalized] = entity_id

        for alias in (aliases or []):
            alias_norm = _normalize_name(alias)
            if alias_norm and alias_norm != name_normalized:
                self.exact_map[alias_norm] = entity_id

    def remove(self, entity_id: int):
        """从索引移除一个实体"""
        keys_to_remove = [
            k for k, v in self.exact_map.items() if v == entity_id
        ]
        for k in keys_to_remove:
            del self.exact_map[k]

    def find_exact(self, name_normalized: str) -> Optional[int]:
        """精确匹配查找（主名称 + 别名全覆盖）"""
        return self.exact_map.get(name_normalized)


# ── 单例索引 ──

_index_cache: EntityIndex | None = None
_index_tdb: str = ""


def get_entity_index(tdb_name: str = "knowledge") -> EntityIndex:
    """获取或构建实体去重索引（单例，首次调用时全量加载）

    单线程安全：asyncio 协作调度下无竞态。多线程环境需外部加锁。
    """
    global _index_cache, _index_tdb
    if _index_cache is not None and _index_tdb == tdb_name:
        return _index_cache

    from lumen.services.graph._core import _get_tdb
    db = _get_tdb(tdb_name)

    index = EntityIndex()
    try:
        rows = db.tql('FIND {type: "entity"} RETURN *')
        for row in rows:
            node = row.row.get("_", {})
            payload = node.get("payload", {})
            nid = node.get("id")
            if not nid or not payload:
                continue
            name_norm = payload.get("name_normalized", "")
            aliases = payload.get("aliases", [])
            if name_norm:
                index.add(nid, name_norm, aliases)
    except Exception as e:
        logger.warning(f"构建实体索引失败: {e}")

    _index_cache = index
    _index_tdb = tdb_name
    logger.info(f"实体去重索引已加载: {len(index.exact_map)} 条映射")
    return index


def invalidate_index():
    """强制清空索引缓存"""
    global _index_cache, _index_tdb
    _index_cache = None
    _index_tdb = ""


# ── 三阶段去重 ──

async def dedup_entities(
    entities: list[dict],
    index: "EntityIndex",
    tdb_name: str = "knowledge",
) -> list[dict]:
    """三阶段实体去重

    前置条件：entities 中每个元素已有 _vector 字段（由 extract.py batch embed）
    数据流：batch embed → Phase 1 精确 → Phase 2 Top-K → Phase 3 LLM

    Phase 1: 精确匹配（name_normalized + alias，O(1)）
    Phase 2: 无阈值 Top-K 向量召回 + 地板分早退
    Phase 3: LLM 裁决（所有 Top-K 候选都交给 LLM）
    """
    from lumen.services.graph._core import _normalize_name
    from lumen.config import (
        GRAPH_DEDUP_VECTOR_ENABLED, GRAPH_DEDUP_VECTOR_TOP_K,
        GRAPH_DEDUP_VECTOR_FLOOR_SCORE, GRAPH_DEDUP_LLM_ENABLED,
    )

    results = []
    needs_llm: list[tuple[int, list[dict]]] = []

    for i, entity in enumerate(entities):
        name = entity.get("name", "")
        if not name:
            continue

        normalized = _normalize_name(name)

        # Phase 1: 精确匹配（主名称 + 别名全覆盖）
        exact_id = index.find_exact(normalized)
        if exact_id is not None:
            entity["_resolved"] = True
            entity["_existing_id"] = exact_id
            results.append(entity)
            continue

        # Phase 2: 无阈值 Top-K 向量召回
        if GRAPH_DEDUP_VECTOR_ENABLED and "_vector" in entity:
            vector_hits = _vector_top_k_search(
                entity["_vector"], tdb_name,
                top_k=GRAPH_DEDUP_VECTOR_TOP_K,
            )

            if vector_hits:
                best_score = vector_hits[0].get("score", 0.0)

                # 地板分早退：最高分低于地板 → 无关候选，直接创建新实体
                if best_score < GRAPH_DEDUP_VECTOR_FLOOR_SCORE:
                    entity["_resolved"] = False
                    results.append(entity)
                    continue

                # 有值得检查的候选 → Phase 3 LLM
                if GRAPH_DEDUP_LLM_ENABLED:
                    needs_llm.append((i, vector_hits))
                    results.append(entity)
                    continue
                else:
                    entity["_resolved"] = False
                    results.append(entity)
                    continue

        # 无匹配 → 新实体
        entity["_resolved"] = False
        results.append(entity)

    # Phase 3: LLM 裁决
    if needs_llm:
        await _llm_resolve_entities(results, needs_llm)

    return results


def _vector_top_k_search(
    vector: list[float],
    tdb_name: str,
    top_k: int = 5,
) -> list[dict]:
    """用预计算的向量在 TriviumDB 中做 Top-K 召回（无阈值）

    Returns:
        [{"id": int, "name": str, "score": float}, ...] 按 score 降序
    """
    from lumen.services.graph._core import _get_tdb

    try:
        db = _get_tdb(tdb_name)
        # 不设 min_score，纯 Top-K
        results = db.search(
            vector,
            top_k=top_k,
            payload_filter={"type": "entity"},
        )

        hits = []
        for hit in results:
            payload = getattr(hit, "payload", {}) or {}
            score = getattr(hit, "score", 0.0)
            hit_id = getattr(hit, "id", None)
            if hit_id:
                hits.append({
                    "id": hit_id,
                    "name": payload.get("name", ""),
                    "type": payload.get("entity_type", ""),
                    "score": score,
                })

        hits.sort(key=lambda x: x["score"], reverse=True)
        return hits
    except Exception as e:
        logger.debug(f"向量 Top-K 搜索失败: {e}")
        return []


async def _llm_resolve_entities(
    results: list[dict],
    needs_llm: list[tuple[int, list[dict]]],
) -> None:
    """LLM 裁决：每个实体独立调用，传入 Top-K 候选"""
    from lumen.prompt.graph_dedup import entity_dedup_prompt
    from lumen.services.llm import chat
    from lumen.config import DEFAULT_MODEL, GRAPH_DEDUP_LLM_MAX_CANDIDATES

    for idx, vector_hits in needs_llm:
        entity = results[idx]
        candidates = vector_hits[:GRAPH_DEDUP_LLM_MAX_CANDIDATES]

        system, user = entity_dedup_prompt(
            entity["name"], entity.get("type", "Concept"), candidates
        )
        try:
            response = await chat(
                [{"role": "system", "content": system}, {"role": "user", "content": user}],
                model=DEFAULT_MODEL, stream=False,
            )
            text = response.choices[0].message.content if response.choices else ""
            data = _extract_json(text)
            if data and data.get("match") and data.get("matched_id"):
                entity["_resolved"] = True
                entity["_existing_id"] = data["matched_id"]
            else:
                entity["_resolved"] = False
        except Exception as e:
            logger.warning(f"LLM 实体去重失败 ({entity['name']}): {e}")
            entity["_resolved"] = False


def _extract_json(text: str) -> dict | None:
    """复用 extract.py 的健壮 JSON 解析"""
    from lumen.services.graph.extract import _extract_json as _safe_json
    return _safe_json(text)


# ── 边矛盾检测 ──

async def resolve_edge_duplicates(
    new_edges: list[dict],
    tdb_name: str = "knowledge",
) -> tuple[list[dict], list[int]]:
    """对新提取的边做去重 + 矛盾检测

    Returns:
        (resolved_edges, invalidated_edge_ids)
    """
    from lumen.services.graph._core import _get_tdb

    db = _get_tdb(tdb_name)
    resolved = []
    all_invalidated = []

    for edge in new_edges:
        src = edge.get("src_name", "")
        dst = edge.get("dst_name", "")
        fact = edge.get("fact", "")
        if not src or not dst or not fact:
            resolved.append(edge)
            continue

        existing = _find_edges_between(db, src, dst)
        if not existing:
            resolved.append(edge)
            continue

        # 精确去重：fact 归一化后相同
        exact_dup = _find_exact_edge_duplicate(existing, fact)
        if exact_dup is not None:
            edge["_duplicate_of"] = exact_dup["id"]
            edge["_merged_episode_ids"] = exact_dup["payload"].get("episode_ids", [])
            resolved.append(edge)
            continue

        # LLM 矛盾检测（existing 已确认非空）
        existing_facts = [
            {"idx": i, "fact": e["payload"].get("fact", "")}
            for i, e in enumerate(existing)
        ]

        dup_ids, contra_ids = await _llm_resolve_edge(fact, existing_facts, existing)
        all_invalidated.extend(contra_ids)

        if dup_ids:
            edge["_duplicate_of"] = dup_ids[0]
            for eid in dup_ids:
                for e in existing:
                    if e["id"] == eid:
                        edge.setdefault("_merged_episode_ids", []).extend(
                            e["payload"].get("episode_ids", [])
                        )

        resolved.append(edge)

    return resolved, all_invalidated


def _find_edges_between(db, src_name: str, dst_name: str) -> list[dict]:
    """查找两个实体之间的所有有效边"""
    from lumen.services.graph._core import _tql_escape
    results = []
    try:
        safe_src = _tql_escape(src_name)
        safe_dst = _tql_escape(dst_name)
        rows = db.tql(
            f'FIND {{type: "edge", source_name: "{safe_src}", target_name: "{safe_dst}"}} RETURN *'
        )
        for row in rows:
            node = row.row.get("_", {})
            payload = node.get("payload", {})
            nid = node.get("id")
            if nid and payload and payload.get("invalid_at") is None:
                results.append({"id": nid, "payload": payload})
    except Exception as e:
        logger.warning(f"查找边失败 ({src_name} → {dst_name}): {e}")
    return results


def _find_exact_edge_duplicate(existing: list[dict], fact: str) -> Optional[dict]:
    """精确去重：fact 归一化后相同"""
    from lumen.services.graph._core import _normalize_name
    norm_new = _normalize_name(fact)
    for e in existing:
        norm_old = _normalize_name(e["payload"].get("fact", ""))
        if norm_new == norm_old:
            return e
    return None


async def _llm_resolve_edge(
    new_fact: str,
    existing_facts: list[dict],
    existing_edges: list[dict],
) -> tuple[list[int], list[int]]:
    """LLM 边矛盾分类，返回 (duplicate_ids, contradicted_ids)"""
    from lumen.prompt.graph_dedup import edge_contradiction_prompt
    from lumen.services.llm import chat
    from lumen.config import DEFAULT_MODEL

    system, user = edge_contradiction_prompt(new_fact, existing_facts)
    try:
        response = await chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            model=DEFAULT_MODEL, stream=False,
        )
        text = response.choices[0].message.content if response.choices else ""
        data = _extract_json(text)
        if not data:
            return [], []

        dup_ids = []
        contra_ids = []
        for r in data.get("results", []):
            idx = r.get("idx", -1)
            if idx < 0 or idx >= len(existing_edges):
                continue
            eid = existing_edges[idx]["id"]
            relation = r.get("relation", "unrelated")
            if relation == "duplicate":
                dup_ids.append(eid)
            elif relation == "contradicted":
                contra_ids.append(eid)

        return dup_ids, contra_ids
    except Exception as e:
        logger.warning(f"LLM 边矛盾检测失败: {e}")
        return [], []


async def apply_edge_invalidations(
    invalidated_ids: list[int],
    new_valid_at: float | None,
    tdb_name: str = "knowledge",
) -> int:
    """对被矛盾的旧边设置 invalid_at"""
    from lumen.services.graph._core import _get_tdb

    if not invalidated_ids or new_valid_at is None:
        return 0

    db = _get_tdb(tdb_name)
    count = 0
    for eid in invalidated_ids:
        payload = db.get_payload(eid)
        if not payload:
            continue
        if payload.get("invalid_at") is not None:
            continue
        old_valid = payload.get("valid_at")
        if old_valid is not None and old_valid >= new_valid_at:
            continue
        payload["invalid_at"] = new_valid_at
        db.update_payload(eid, payload)
        count += 1

    if count:
        db.flush()
        logger.info(f"边矛盾处理：{count} 条旧边已失效")
    return count
