"""
T19 图谱提取管道
文本 → LLM 抽取实体/关系 → batch_upsert 存入 TriviumDB
"""

import json
import re
import logging

from lumen.config import GRAPH_ENTITY_TYPES, GRAPH_EXTRACT_MODEL, DEFAULT_MODEL

logger = logging.getLogger(__name__)

MIN_CONTENT_LENGTH = 50
MAX_CONTENT_LENGTH = 4000


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


async def extract_and_store(content: str, tdb_name: str = "knowledge",
                            source_episode_id: str = "",
                            owner_id: str = "") -> dict | None:
    """完整提取管道：文本 → LLM 抽取 → 存储

    Args:
        content: 待提取的文本
        tdb_name: 目标 TDB（knowledge / memory）
        source_episode_id: 来源标识（文件 ID / 笔记 ID）
        owner_id: 所有者（角色 ID）

    Returns:
        {"entities_created": N, "edges_created": N} 或 None（跳过/失败）
    """
    if not content or len(content.strip()) < MIN_CONTENT_LENGTH:
        return None

    # 截断
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

    entities = data.get("entities", [])
    edges = data.get("edges", [])

    if not isinstance(entities, list) or not isinstance(edges, list):
        return None

    # 验证 entity_type
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
        valid_edges.append({
            "src_name": edge.get("src_name", "").strip(),
            "dst_name": edge.get("dst_name", "").strip(),
            "label": edge.get("label", "related").strip(),
        })

    if not valid_entities and not valid_edges:
        return None

    try:
        from lumen.services.graph._core import batch_upsert
        result = batch_upsert(
            tdb_name, valid_entities, valid_edges,
            source_episode_id=source_episode_id,
            owner_id=owner_id,
        )
        logger.debug(f"图谱提取完成: {len(valid_entities)} 实体, {len(valid_edges)} 边 → {result}")
        return result
    except Exception as e:
        logger.warning(f"图谱批量存储失败: {e}")
        return None
