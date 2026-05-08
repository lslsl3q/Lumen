"""
T19 图谱提取管道 — Episode 事务版
文本 → 创建 Episode → LLM 抽取实体/关系 → batch_upsert → commit/rollback
"""
import json
import re
import logging

from lumen.config import GRAPH_ENTITY_TYPES, GRAPH_EXTRACT_MODEL, DEFAULT_MODEL

logger = logging.getLogger(__name__)

MIN_CONTENT_LENGTH = 50
MAX_CONTENT_LENGTH = 4000


# ── JSON 解析 ──

def _extract_json(text: str) -> dict | None:
    """宽松 JSON 解析：从 LLM 响应中提取第一个完整 JSON 对象"""
    if not text:
        return None

    text = text.strip()

    # 找第一个 { 到最后一个 }，兼容 LLM 输出前后有 markdown 或文字的情况
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        return None

    candidate = text[start:end + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # 尝试修复常见问题：尾逗号、单引号
    try:
        fixed = re.sub(r",\s*}", "}", candidate)
        fixed = re.sub(r",\s*]", "]", fixed)
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    logger.debug(f"JSON 解析失败，原始响应前 200 字: {text[:200]}")
    return None


# ── 主管线 ──

async def extract_and_store(content: str, tdb_name: str = "knowledge",
                            source_path: str = "",
                            source_doc_id: str | None = None,
                            source_type: str = "file_chunk",
                            valid_at: float | None = None,
                            # --- 旧参数（向后兼容）---
                            source_episode_id: str = "",
                            owner_id: str = "") -> dict | None:
    """完整提取管道：文本 → 创建 Episode → LLM 抽取 → batch_upsert → commit/rollback

    事务模型：
      1. create_episode(content, source_path, ...) → Episode 状态 pending
      2. LLM 提取实体/边
      3. batch_upsert 存入图谱
      4. commit_episode → 状态 active（成功）/ rollback_episode → 状态 deleted（失败）

    Args:
        content: 待提取的文本
        tdb_name: 目标 TDB（knowledge / memory）
        source_path: 来源文件路径（用于 ACL 隔离 + source_folders 维护）
        source_doc_id: 来源文档 ID（Episode 关联外键）
        source_type: 来源类型 — file_chunk | dream | reflection | manual
        valid_at: 内容生效时间戳
        source_episode_id: 旧参数（向后兼容，内容来源标识）
        owner_id: 旧参数（向后兼容，角色 ID）

    Returns:
        {"entities_created": N, "edges_created": N, "episode_id": int} 或 None（跳过/失败）
    """
    if not content or len(content.strip()) < MIN_CONTENT_LENGTH:
        return None

    # --- Step 1: 创建 Episode (pending) ---
    from lumen.services.graph.episodes import (
        create_episode, commit_episode, rollback_episode,
    )

    ep_id = create_episode(
        content=content,
        source_path=source_path,
        source_doc_id=source_doc_id,
        source_type=source_type,
        valid_at=valid_at,
        tdb_name=tdb_name,
    )

    try:
        # --- Step 2: LLM 提取实体和边 ---
        extraction = await _llm_extract(content)

        if not extraction:
            logger.info(f"Episode {ep_id}: LLM 提取结果为空，提交空 Episode")
            commit_episode(ep_id, tdb_name)
            return {"entities_created": 0, "edges_created": 0, "episode_id": ep_id}

        # --- Step 2.5: 去重 + 矛盾检测 ---
        from lumen.config import (
            GRAPH_DEDUP_ENABLED, GRAPH_CONTRADICTION_ENABLED,
        )

        entities_list = extraction.get("entities", [])
        edges_list = extraction.get("edges", [])

        # Batch embed 实体名字（带重试机制）
        if GRAPH_DEDUP_ENABLED and entities_list:
            from lumen.services.embedding import get_service
            backend = await get_service(tdb_name)
            if not backend:
                raise RuntimeError("嵌入服务不可用（未配置或连接失败），图谱去重无法执行。请在设置中检查嵌入服务连通性。")

            names = [e.get("name", "") for e in entities_list if e.get("name")]
            vectors = None
            max_retries = 3

            for attempt in range(max_retries):
                try:
                    vectors = await backend.encode_batch(names)
                    if vectors and len(vectors) == len(names):
                        break
                except Exception as ex:
                    logger.warning(f"实体名字 embed 第 {attempt + 1} 次失败: {ex}")
                    if attempt < max_retries - 1:
                        import asyncio as _aio
                        await _aio.sleep(2 ** attempt)  # 指数退避: 1s, 2s
                    else:
                        logger.error("实体名字 embed 达到最大重试次数，管线熔断。")

            if not vectors or len(vectors) != len(names):
                raise RuntimeError("嵌入服务调用失败（重试3次均未恢复），图谱提取已中止。请检查嵌入服务连通性后重试。")

            vi = 0
            for e in entities_list:
                if e.get("name") and vi < len(vectors):
                    e["_vector"] = vectors[vi]
                    vi += 1

        # 实体去重
        if GRAPH_DEDUP_ENABLED and entities_list:
            from lumen.services.graph.dedup import dedup_entities, get_entity_index
            index = get_entity_index(tdb_name)
            entities_list = await dedup_entities(entities_list, index, tdb_name)
            extraction["entities"] = entities_list

        # 边矛盾检测
        invalidated_edge_ids = []
        if GRAPH_CONTRADICTION_ENABLED and edges_list:
            from lumen.services.graph.dedup import resolve_edge_duplicates
            edges_list, invalidated_edge_ids = await resolve_edge_duplicates(
                edges_list, tdb_name
            )
            extraction["edges"] = edges_list

        # --- Step 3: 存入图谱（batch_upsert 带 episode_id + source_path）---
        from lumen.services.graph._core import batch_upsert

        result = batch_upsert(
            tdb_name,
            extraction["entities"],
            extraction["edges"],
            source_path=source_path,
            episode_id=ep_id,
            source_episode_id=source_episode_id,
            owner_id=owner_id,
        )

        # --- Step 3.5: 处理被矛盾的旧边 ---
        if invalidated_edge_ids:
            from lumen.services.graph.dedup import apply_edge_invalidations
            valid_at_ts = extraction["edges"][0].get("valid_at") if extraction.get("edges") else None
            await apply_edge_invalidations(invalidated_edge_ids, valid_at_ts, tdb_name)

        # --- Step 4: 事务提交 ---
        commit_episode(ep_id, tdb_name)

        result["episode_id"] = ep_id
        logger.info(
            f"Episode {ep_id}: 提取完成 — "
            f"{result.get('entities_created', 0)} 实体, "
            f"{result.get('edges_created', 0)} 边"
        )
        return result

    except Exception as e:
        logger.error(f"Episode {ep_id}: 提取失败，执行 rollback — {e}")
        try:
            rollback_episode(ep_id, tdb_name)
        except Exception as rb_err:
            logger.error(f"Episode {ep_id}: rollback 也失败 — {rb_err}")
        raise


# ── LLM 调用 ──

async def _llm_extract(content: str) -> dict | None:
    """LLM 提取实体和边，返回验证后的 dict 或 None"""
    truncated = content.strip()[:MAX_CONTENT_LENGTH]
    model = GRAPH_EXTRACT_MODEL or DEFAULT_MODEL

    from lumen.services.llm import chat
    from lumen.prompt.graph_extract import load_prompts

    system_prompt, user_template = load_prompts()

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_template.format(content=truncated)},
    ]

    try:
        response = await chat(messages, model=model, stream=False)
        raw_text = response.choices[0].message.content if response.choices else ""
    except Exception as e:
        logger.warning(f"图谱提取 LLM 调用失败: {e}")
        return None

    data = _extract_json(raw_text)
    if not data:
        logger.debug(f"图谱提取 JSON 解析失败，原始文本前 100 字: {truncated[:100]}")
        return None

    return _validate_extraction(data)


def _parse_timestamp(value: str | None) -> float | None:
    """解析 ISO 8601 时间戳为 Unix 时间戳"""
    if not value or value.strip().lower() in ("null", "none", ""):
        return None
    from datetime import datetime, timezone
    try:
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


def _validate_extraction(data: dict) -> dict | None:
    """验证并清洗 LLM 提取结果"""
    entities = data.get("entities", [])
    edges = data.get("edges", [])

    if not isinstance(entities, list) or not isinstance(edges, list):
        return None

    valid_entities = []
    for ent in entities:
        if not isinstance(ent, dict):
            continue
        etype = ent.get("type", "Concept")
        if etype not in GRAPH_ENTITY_TYPES:
            etype = "Concept"
        valid_entities.append({
            "name": ent.get("name", "").strip(),
            "type": etype,
            "aliases": ent.get("aliases", []),
            "extra": ent.get("extra", {}),
        })

    valid_edges = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        # 支持多种字段命名: src_name/dst_name 或 source/target
        src_name = edge.get("src_name", edge.get("source", "")).strip()
        dst_name = edge.get("dst_name", edge.get("target", "")).strip()
        if not src_name or not dst_name:
            continue
        valid_edges.append({
            "src_name": src_name,
            "dst_name": dst_name,
            "label": edge.get("label", edge.get("relation", "related")).strip(),
            "fact": edge.get("fact", edge.get("label", "")),
            "valid_at": _parse_timestamp(edge.get("valid_at")),
            "invalid_at": _parse_timestamp(edge.get("invalid_at")),
        })

    if not valid_entities and not valid_edges:
        return None

    return {"entities": valid_entities, "edges": valid_edges}
