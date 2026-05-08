"""
图谱搜索增强 — 向量搜索 + 图遍历扩展 + 社群加权

Path C 的搜索执行层，从 _core.py 抽取。
ACL 过滤构建留在 _core.py 不动，这里只负责拿到 filter 后执行搜索。

三步增强：
  Step A: 向量搜索边节点（原始逻辑，保持不变）
  Step B: search_advanced 图遍历扩展（BFS 从匹配节点向外扩展）
  Step C: 社群加权（命中的实体属于热门社群 → 提权 + 注入社群摘要）
"""

import logging
from typing import Optional

from lumen.config import (
    GRAPH_RECALL_TOP_K,
    GRAPH_SEARCH_EXPAND_DEPTH,
    GRAPH_SEARCH_COMMUNITY_BOOST,
    GRAPH_SEARCH_COMMUNITY_ENABLED,
)
from lumen.services.graph._core import _get_tdb

logger = logging.getLogger(__name__)


# ── 主入口 ──

async def search_graph(
    query_vector: list[float],
    query_text: str,
    tdb_name: str,
    top_k: int,
    acl_filter: Optional[dict],
    allowed_folders: list[str],
    character_id: str,
) -> list[dict]:
    """图谱搜索主入口：向量搜索 → 图遍历扩展 → 社群加权

    Args:
        query_vector: 查询向量
        query_text: 查询文本
        tdb_name: TDB 实例名（通常 "knowledge"）
        top_k: 返回数量上限
        acl_filter: ACL 过滤条件 dict 或 None
        allowed_folders: ACL 允许的 source_path 前缀列表
        character_id: 角色 ID

    Returns:
        [{"entity_id": int, "content": str, "score": float}, ...]
    """
    db = _get_tdb(tdb_name)
    all_hits: list[dict] = []

    # ── Step A: 向量搜索边节点（原始逻辑）──
    vector_hits = _vector_search_edges(db, query_vector, top_k, acl_filter)
    all_hits.extend(vector_hits)

    # ── Step B: 图遍历扩展 ──
    if GRAPH_SEARCH_EXPAND_DEPTH > 0:
        traversal_hits = _traversal_search(
            query_vector, db, GRAPH_SEARCH_EXPAND_DEPTH,
            allowed_folders, top_k, character_id,
        )
        all_hits.extend(traversal_hits)

    # 去重（按 entity_id，保留最高分）
    all_hits = _deduplicate_hits(all_hits)

    # ── Step C: 社群加权 ──
    if GRAPH_SEARCH_COMMUNITY_ENABLED and all_hits:
        all_hits = _community_boost(
            query_vector, all_hits, db,
            GRAPH_SEARCH_COMMUNITY_BOOST, tdb_name,
        )

    # 截断到 top_k
    all_hits.sort(key=lambda h: h["score"], reverse=True)
    return all_hits[:top_k]


# ── Step A: 向量搜索 ──

def _vector_search_edges(
    db, query_vector: list[float], top_k: int,
    acl_filter: Optional[dict],
) -> list[dict]:
    """向量搜索边节点，提取自原 _core.py Path C

    Returns:
        [{"entity_id": int, "content": str, "score": float}, ...]
    """
    hits: list[dict] = []
    try:
        results = db.search(
            query_vector,
            top_k=top_k,
            min_score=0.1,
            payload_filter=acl_filter,
        )
        for r in results:
            payload = r.payload if hasattr(r, "payload") else {}
            # 跳过非边节点（无 ACL 过滤时可能混入实体节点）
            if payload.get("type") != "edge":
                continue
            fact = payload.get("fact", "")
            source_name = payload.get("source_name", "")
            target_name = payload.get("target_name", "")
            label = payload.get("label", "")
            if fact:
                if source_name:
                    content = f"[图谱] {source_name} {label} {target_name}: {fact}"
                else:
                    content = f"[图谱] {fact}"
                hits.append({
                    "entity_id": r.id if hasattr(r, "id") else 0,
                    "content": content,
                    "score": r.score if hasattr(r, "score") else 0.5,
                })
    except Exception as e:
        logger.debug(f"图谱向量搜索跳过: {e}")
    return hits


# ── Step B: 图遍历扩展 ──

def _traversal_search(
    query_vector: list[float],
    db,
    expand_depth: int,
    allowed_folders: list[str],
    top_k: int,
    character_id: str,
) -> list[dict]:
    """search_advanced 图遍历扩展

    使用 TriviumDB 的 expand_depth 参数，从向量匹配的边节点出发做 BFS，
    发现 1-hop 或 2-hop 的关联边节点。

    ACL 过滤必须注入，确保遍历不会越过权限边界。

    Returns:
        [{"entity_id": int, "content": str, "score": float}, ...]
    """
    hits: list[dict] = []
    try:
        # 构建 ACL payload_filter
        if character_id and allowed_folders:
            payload_filter = {
                "type": "edge",
                "source_path": {"$in": allowed_folders},
                "invalid_at": None,
            }
        elif character_id:
            # ACL 允许所有文件夹，只过滤边节点类型
            payload_filter = {
                "type": "edge",
                "invalid_at": None,
            }
        else:
            # 无 character_id，不过滤（管理后台等场景）
            payload_filter = {
                "type": "edge",
                "invalid_at": None,
            }

        results = db.search_advanced(
            query_vector,
            top_k=top_k,
            expand_depth=expand_depth,
            min_score=0.1,
            payload_filter=payload_filter,
        )
        for r in results:
            payload = r.payload if hasattr(r, "payload") else {}
            if payload.get("type") != "edge":
                continue
            fact = payload.get("fact", "")
            source_name = payload.get("source_name", "")
            target_name = payload.get("target_name", "")
            label = payload.get("label", "")
            if fact:
                if source_name:
                    content = f"[图谱·遍历] {source_name} {label} {target_name}: {fact}"
                else:
                    content = f"[图谱·遍历] {fact}"
                hits.append({
                    "entity_id": r.id if hasattr(r, "id") else 0,
                    "content": content,
                    "score": r.score if hasattr(r, "score") else 0.5,
                })
        logger.debug(
            f"图遍历扩展 (depth={expand_depth}): {len(hits)} 条结果"
        )
    except Exception as e:
        logger.debug(f"图遍历扩展跳过: {e}")
    return hits


# ── Step C: 社群加权 ──

def _community_boost(
    query_vector: list[float],
    graph_hits: list[dict],
    db,
    boost_factor: float,
    tdb_name: str,
) -> list[dict]:
    """社群加权：命中的边涉及热门社群实体 → 提权 + 注入社群摘要

    策略：
    1. 向量搜索 CommunityNode 质心，找最相关的 top-3 社群
    2. 构建 entity_id → community 映射（从社群的 entity_ids 字段）
    3. 对每条 graph_hit，检查其 source/target 实体是否属于热门社群
    4. 属于 → score *= (1 + boost_factor)
    5. 将 top 社群摘要作为额外 hit 注入

    Returns:
        更新后的 graph_hits（含提权和社群摘要注入）
    """
    try:
        from lumen.services.graph.community import get_communities_for_query
    except ImportError:
        logger.debug("社群模块不可用，跳过社群加权")
        return graph_hits

    # 1. 查询最相关的社群
    communities = get_communities_for_query(query_vector, tdb_name, top_k=3)
    if not communities:
        return graph_hits

    # 2. 构建 entity_id → community 映射
    entity_to_community: dict[int, dict] = {}
    for comm in communities:
        comm_id = comm["id"]
        try:
            payload = db.get_payload(comm_id)
        except Exception:
            continue
        if not payload:
            continue
        member_ids = payload.get("entity_ids", [])
        for eid in member_ids:
            entity_to_community[eid] = comm

    if not entity_to_community:
        return graph_hits

    # 3. 提权：遍历 graph_hits，检查关联实体是否属于热门社群
    boosted_count = 0
    for hit in graph_hits:
        edge_id = hit.get("entity_id", 0)
        if not edge_id:
            continue

        # 获取边的 payload 以找 source/target 实体名
        try:
            payload = db.get_payload(edge_id)
        except Exception:
            continue
        if not payload or payload.get("type") != "edge":
            continue

        source_name = payload.get("source_name", "")
        target_name = payload.get("target_name", "")

        # 通过名称找实体 node_id
        from lumen.services.graph._core import find_entity_by_name
        source_ent = find_entity_by_name(tdb_name, source_name) if source_name else None
        target_ent = find_entity_by_name(tdb_name, target_name) if target_name else None

        # 检查是否属于热门社群
        in_community = False
        for eid in (source_ent, target_ent):
            if eid and eid in entity_to_community:
                in_community = True
                break

        if in_community:
            hit["score"] = hit["score"] * (1.0 + boost_factor)
            boosted_count += 1

    if boosted_count:
        logger.debug(f"社群加权: {boosted_count}/{len(graph_hits)} 条命中被提权")

    # 4. 注入社群摘要作为额外 hit
    for comm in communities[:2]:  # 最多注入 2 条社群摘要
        name = comm.get("name", "")
        summary = comm.get("summary", "")
        if not summary:
            continue
        content = f"[社群] {name}: {summary}"
        graph_hits.append({
            "entity_id": comm["id"],
            "content": content,
            "score": comm.get("score", 0.3) * 0.5,  # 社群摘要分数低于直接命中
        })

    return graph_hits


# ── 去重 ──

def _deduplicate_hits(hits: list[dict]) -> list[dict]:
    """按 entity_id 去重，保留最高分

    遍历扩展可能产生与向量搜索相同的边节点，需要去重。
    """
    seen: dict[int, dict] = {}
    for hit in hits:
        eid = hit.get("entity_id", 0)
        if eid not in seen or hit["score"] > seen[eid]["score"]:
            seen[eid] = hit
    return list(seen.values())
