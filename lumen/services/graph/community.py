"""
图谱社群检测服务 — Leiden 社区 + LLM 社群摘要

流程：
  1. run_leiden() — 调用 TriviumDB Leiden 聚类，过滤只保留实体节点
  2. per-community: _gather_context() 收集实体名+边事实
  3. per-community: _llm_summarize_community() LLM 生成名称+摘要
  4. _store_community_node() 存入 CommunityNode + BELONGS_TO 链接
  5. _hierarchical_reduce() Graphiti 风格层级合并（可选）
"""

import asyncio
import json
import logging
import re
from typing import Optional

from lumen.config import (
    COMMUNITY_ENABLED,
    COMMUNITY_LEIDEN_MIN_SIZE,
    COMMUNITY_LEIDEN_MAX_ITER,
    COMMUNITY_SUMMARY_ENABLED,
    COMMUNITY_MAX_FACTS_PER_PROMPT,
    client,
    get_model,
)
from lumen.services.graph._core import _get_tdb, _tql_escape

logger = logging.getLogger(__name__)


# ── JSON 解析 ──

def _extract_json(text: str) -> dict | None:
    """宽松 JSON 解析：从 LLM 响应中提取第一个完整 JSON 对象"""
    if not text:
        return None

    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        return None

    candidate = text[start:end + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # 修复常见问题：尾逗号、单引号
    try:
        fixed = re.sub(r",\s*}", "}", candidate)
        fixed = re.sub(r",\s*]", "]", fixed)
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    logger.debug(f"社群 JSON 解析失败，原始响应前 200 字: {text[:200]}")
    return None


# ── Leiden 聚类 ──

def run_leiden(tdb_name: str = "knowledge") -> dict:
    """调用 TriviumDB Leiden 聚类，过滤只保留实体节点

    Returns:
        {
            "communities": [[entity_id, ...], ...],  # 只含实体节点的社群
            "centroids": {cluster_idx: [float, ...]},  # 对应社群的质心向量
            "num_clusters": int,
        }
    """
    db = _get_tdb(tdb_name)

    result = db.leiden_cluster(
        min_community_size=COMMUNITY_LEIDEN_MIN_SIZE,
        max_iterations=COMMUNITY_LEIDEN_MAX_ITER,
        compute_centroids=True,
    )

    raw_communities = result.get("communities", [])
    raw_centroids = result.get("centroids", {})

    # 过滤：只保留 payload.type == "entity" 的节点
    filtered_communities = []
    filtered_centroids = {}

    for idx, member_ids in enumerate(raw_communities):
        entity_ids = []
        for nid in member_ids:
            try:
                payload = db.get_payload(nid)
            except Exception:
                continue
            if payload and payload.get("type") == "entity":
                entity_ids.append(nid)

        # 只保留仍满足最小规模的社群
        if len(entity_ids) >= COMMUNITY_LEIDEN_MIN_SIZE:
            new_idx = len(filtered_communities)
            filtered_communities.append(entity_ids)
            # centroids 键可能是 int 或 str，统一处理
            centroid = raw_centroids.get(idx) or raw_centroids.get(str(idx))
            if centroid:
                filtered_centroids[new_idx] = centroid

    logger.info(
        f"Leiden 聚类完成: {len(raw_communities)} 原始社群 → "
        f"{len(filtered_communities)} 实体社群 (min_size={COMMUNITY_LEIDEN_MIN_SIZE})"
    )

    return {
        "communities": filtered_communities,
        "centroids": filtered_centroids,
        "num_clusters": len(filtered_communities),
    }


# ── 上下文收集 ──

def _gather_context(db, entity_ids: list[int]) -> tuple[list[str], list[str]]:
    """收集社群内实体的名称和关系事实

    Args:
        db: TriviumDB 实例
        entity_ids: 社群内的实体节点 ID 列表

    Returns:
        (entity_names, facts) — 实体名称列表、边事实文本列表
    """
    # 1. 收集实体名称，同时建立 id→name 映射
    id_to_name: dict[int, str] = {}
    for eid in entity_ids:
        try:
            payload = db.get_payload(eid)
        except Exception:
            continue
        if payload:
            name = payload.get("name", "")
            if name:
                id_to_name[eid] = name

    entity_names = list(id_to_name.values())

    if not entity_names:
        return [], []

    # 2. TQL 查询所有涉及这些实体的边
    facts_with_weight: list[tuple[str, int]] = []  # (fact, connection_count)

    # 构建名称集合用于匹配
    name_set = set(id_to_name.values())

    # 用 TQL 查所有 edge 类型节点，然后在内存中过滤
    try:
        rows = db.tql('FIND {type: "edge"} RETURN *')
        for row in rows:
            node = row.row.get("_", {})
            payload = node.get("payload", {})
            if not payload:
                continue

            source_name = payload.get("source_name", "")
            target_name = payload.get("target_name", "")
            fact = payload.get("fact", "")

            # 至少有一端在社群内
            if source_name in name_set or target_name in name_set:
                if fact:
                    # 计算连接数（两端都在社群内的边权重更高）
                    both_in = source_name in name_set and target_name in name_set
                    weight = 2 if both_in else 1
                    facts_with_weight.append((fact, weight))
    except Exception as e:
        logger.debug(f"TQL 查询边失败: {e}")

    # 3. 按连接数排序，截断到 token 预算
    facts_with_weight.sort(key=lambda x: x[1], reverse=True)
    facts = [f[0] for f in facts_with_weight[:COMMUNITY_MAX_FACTS_PER_PROMPT]]

    return entity_names, facts


# ── LLM 调用 ──

async def _llm_summarize_community(
    names: list[str], facts: list[str]
) -> tuple[str, str]:
    """LLM 生成社群名称 + 摘要

    Returns:
        (name, summary)
    """
    from lumen.prompt.graph_community import community_summary_prompt

    entity_text = "\n".join(f"- {n}" for n in names)
    fact_text = "\n".join(f"- {f}" for f in facts) if facts else "（无边关系）"

    system, user = community_summary_prompt(entity_text, fact_text)

    try:
        resp = await client.chat.completions.create(
            model=get_model(),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
        )
        raw = resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"社群摘要 LLM 调用失败: {e}")
        return "未命名社群", f"包含 {len(names)} 个实体"

    data = _extract_json(raw)
    if not data:
        logger.debug(f"社群摘要 JSON 解析失败: {raw[:200]}")
        return "未命名社群", f"包含 {len(names)} 个实体"

    name = data.get("name", "未命名社群").strip()
    summary = data.get("summary", "").strip()
    if not summary:
        summary = f"包含 {len(names)} 个实体"

    return name, summary


async def _llm_merge_pair(summary_a: str, summary_b: str) -> str:
    """LLM 合并两个社群摘要

    Returns:
        合并后的摘要文本
    """
    from lumen.prompt.graph_community import community_merge_prompt

    system, user = community_merge_prompt(summary_a, summary_b)

    try:
        resp = await client.chat.completions.create(
            model=get_model(),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
        )
        raw = resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"社群合并 LLM 调用失败: {e}")
        return f"{summary_a}；{summary_b}"

    data = _extract_json(raw)
    if not data:
        logger.debug(f"社群合并 JSON 解析失败: {raw[:200]}")
        return f"{summary_a}；{summary_b}"

    return data.get("summary", f"{summary_a}；{summary_b}")


# ── 存储 ──

def _store_community_node(
    db,
    name: str,
    summary: str,
    entity_ids: list[int],
    centroid_vec: list[float] | None = None,
) -> int:
    """创建 CommunityNode 并链接成员实体

    Args:
        db: TriviumDB 实例
        name: 社群名称
        summary: 社群摘要
        entity_ids: 成员实体 ID 列表
        centroid_vec: 质心向量（来自 Leiden），为 None 时使用零向量

    Returns:
        CommunityNode 的 node_id
    """
    dim = db.dim()
    vector = centroid_vec if centroid_vec is not None else [0.0] * dim

    payload = {
        "type": "community",
        "name": name,
        "summary": summary,
        "entity_ids": entity_ids,
        "entity_count": len(entity_ids),
    }
    node_id = db.insert(vector, payload)

    # 创建 BELONGS_TO 链接
    for eid in entity_ids:
        try:
            db.link(node_id, eid, "BELONGS_TO", 1.0)
        except Exception as e:
            logger.debug(f"BELONGS_TO link 失败 ({node_id}->{eid}): {e}")

    db.flush()
    return node_id


# ── 层级合并（Graphiti 风格）──

async def _hierarchical_reduce(summaries: list[str]) -> str:
    """Graphiti 风格层级合并：N → N/2 → ... → 1

    每层两两配对，并行调 LLM 合并。

    Args:
        summaries: 社群摘要列表

    Returns:
        最终合并后的全局摘要
    """
    if not summaries:
        return ""
    if len(summaries) == 1:
        return summaries[0]

    current = list(summaries)

    while len(current) > 1:
        # 两两配对
        pairs = []
        for i in range(0, len(current), 2):
            if i + 1 < len(current):
                pairs.append((current[i], current[i + 1]))
            else:
                # 奇数个时，最后一个直接晋升
                pairs.append((current[i], None))

        # 并行合并
        tasks = []
        for a, b in pairs:
            if b is None:
                # 创建一个直接返回 a 的协程
                async def _identity(s=a):
                    return s
                tasks.append(_identity())
            else:
                tasks.append(_llm_merge_pair(a, b))

        merged = await asyncio.gather(*tasks)
        current = list(merged)

    return current[0]


# ── 主入口 ──

async def build_communities(tdb_name: str = "knowledge") -> dict:
    """社群检测主入口：Leiden → LLM 摘要 → 存储 CommunityNode

    Returns:
        {
            "num_communities": int,
            "communities": [{"id": int, "name": str, "entity_count": int}, ...],
            "global_summary": str | None,
        }
    """
    if not COMMUNITY_ENABLED:
        logger.info("社群检测已禁用 (COMMUNITY_ENABLED=False)")
        return {"num_communities": 0, "communities": [], "global_summary": None}

    db = _get_tdb(tdb_name)

    # 1. 清除旧的社群节点
    _clear_old_communities(db)

    # 2. Leiden 聚类
    leiden_result = run_leiden(tdb_name)
    communities = leiden_result["communities"]
    centroids = leiden_result["centroids"]

    if not communities:
        logger.info("Leiden 聚类无结果（实体不足或无法成群）")
        return {"num_communities": 0, "communities": [], "global_summary": None}

    # 3. 逐社群：收集上下文 → LLM 摘要 → 存储
    stored_communities = []
    all_summaries = []

    for idx, entity_ids in enumerate(communities):
        names, facts = _gather_context(db, entity_ids)

        if COMMUNITY_SUMMARY_ENABLED and names:
            name, summary = await _llm_summarize_community(names, facts)
        else:
            name = f"社群 {idx + 1}"
            summary = f"包含 {len(entity_ids)} 个实体"

        centroid = centroids.get(idx)
        node_id = _store_community_node(db, name, summary, entity_ids, centroid)

        stored_communities.append({
            "id": node_id,
            "name": name,
            "entity_count": len(entity_ids),
        })
        all_summaries.append(summary)

        logger.debug(
            f"社群 {idx + 1}/{len(communities)}: "
            f"{name} ({len(entity_ids)} 实体, node_id={node_id})"
        )

    # 4. 层级合并（全局摘要）
    global_summary = None
    if COMMUNITY_SUMMARY_ENABLED and len(all_summaries) > 1:
        global_summary = await _hierarchical_reduce(all_summaries)
        logger.info(f"全局社群摘要: {global_summary[:100]}...")

    logger.info(
        f"社群检测完成: {len(stored_communities)} 个社群, "
        f"覆盖 {sum(c['entity_count'] for c in stored_communities)} 个实体"
    )

    return {
        "num_communities": len(stored_communities),
        "communities": stored_communities,
        "global_summary": global_summary,
    }


def _clear_old_communities(db) -> None:
    """清除所有已有的社群节点（build 前调用，确保幂等）"""
    try:
        rows = db.tql('FIND {type: "community"} RETURN *')
        for row in rows:
            node = row.row.get("_", {})
            nid = node.get("id")
            if nid:
                # 先解除所有 BELONGS_TO 链接
                try:
                    neighbors = db.neighbors(nid, depth=1)
                    for neighbor_id in neighbors:
                        try:
                            db.unlink(nid, neighbor_id)
                        except Exception:
                            pass
                except Exception:
                    pass
                # 删除节点
                try:
                    db.delete(nid)
                except Exception:
                    pass
        db.flush()
    except Exception as e:
        logger.debug(f"清除旧社群节点失败（可能不存在）: {e}")


# ── 查询接口 ──

def get_communities_for_query(
    query_vector: list[float],
    tdb_name: str = "knowledge",
    top_k: int = 3,
) -> list[dict]:
    """向量搜索 CommunityNode，返回最相关的 top-k 社群摘要

    Args:
        query_vector: 查询向量
        tdb_name: TDB 实例名
        top_k: 返回数量

    Returns:
        [{"id": int, "name": str, "summary": str, "entity_count": int, "score": float}, ...]
    """
    db = _get_tdb(tdb_name)

    # 向量搜索社群节点
    try:
        results = db.search(query_vector, top_k=top_k * 3)  # 多搜一些再过滤
    except Exception as e:
        logger.warning(f"社群向量搜索失败: {e}")
        return []

    communities = []
    for node_id, score in results:
        try:
            payload = db.get_payload(node_id)
        except Exception:
            continue
        if not payload or payload.get("type") != "community":
            continue

        communities.append({
            "id": node_id,
            "name": payload.get("name", ""),
            "summary": payload.get("summary", ""),
            "entity_count": payload.get("entity_count", 0),
            "score": score,
        })

        if len(communities) >= top_k:
            break

    return communities


def list_all_communities(tdb_name: str = "knowledge") -> list[dict]:
    """列出所有社群节点

    Returns:
        [{"id": int, "name": str, "summary": str, "entity_count": int}, ...]
    """
    db = _get_tdb(tdb_name)
    communities = []

    try:
        rows = db.tql('FIND {type: "community"} RETURN *')
        for row in rows:
            node = row.row.get("_", {})
            payload = node.get("payload", {})
            nid = node.get("id")
            if not nid or not payload:
                continue

            communities.append({
                "id": nid,
                "name": payload.get("name", ""),
                "summary": payload.get("summary", ""),
                "entity_count": payload.get("entity_count", 0),
            })
    except Exception as e:
        logger.warning(f"列出社群失败: {e}")

    return communities


def get_community_detail(
    community_id: int, tdb_name: str = "knowledge"
) -> Optional[dict]:
    """获取单个社群详情（含成员实体名称）

    Args:
        community_id: 社群节点 ID
        tdb_name: TDB 实例名

    Returns:
        社群详情 dict 或 None
    """
    db = _get_tdb(tdb_name)

    try:
        payload = db.get_payload(community_id)
    except Exception:
        return None

    if not payload or payload.get("type") != "community":
        return None

    # 获取成员实体名称
    entity_names = []
    entity_ids = payload.get("entity_ids", [])
    for eid in entity_ids:
        try:
            ep = db.get_payload(eid)
            if ep:
                name = ep.get("name", "")
                if name:
                    entity_names.append({"id": eid, "name": name, "entity_type": ep.get("entity_type", "")})
        except Exception:
            pass

    return {
        "id": community_id,
        "name": payload.get("name", ""),
        "summary": payload.get("summary", ""),
        "entity_count": payload.get("entity_count", 0),
        "entities": entity_names,
    }
