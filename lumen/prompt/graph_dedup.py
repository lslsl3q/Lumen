"""图谱去重 + 矛盾检测 Prompt（中文指令 + 英文 JSON 输出）"""
from __future__ import annotations


def entity_dedup_prompt(
    new_name: str,
    new_type: str,
    candidates: list[dict],
) -> tuple[str, str]:
    """实体去重 LLM Prompt"""
    system = """你是实体去重专家。判断两个实体是否指同一个事物。

规则：
- 一个人可能有多个称呼（真名、绰号、代号），算同一个实体
- 同一个地点的不同翻译或简称算同一个实体
- 不同的人即使名字相似（如"张明"和"张铭"）算不同实体
- 类型不同但可能同义的实体需要谨慎判断

输出 JSON：
{"match": true/false, "matched_id": <id or null>, "reason": "简短理由"}"""

    cand_text = "\n".join(
        f"  - id={c['id']}, name=\"{c['name']}\", type=\"{c.get('type', '')}\""
        for c in candidates
    )
    user = f"""新实体：name="{new_name}", type="{new_type}"

候选匹配：
{cand_text}

判断新实体和哪个候选是同一个（如果有的话）。输出 JSON。"""

    return system, user


def edge_contradiction_prompt(
    new_fact: str,
    existing_facts: list[dict],
) -> tuple[str, str]:
    """边矛盾检测 LLM Prompt"""
    system = """你是事实去重和矛盾检测专家。对每条已有事实，判断与新事实的关系。

关系分类：
- duplicate: 事实内容相同（可合并）
- contradicted: 新事实与旧事实矛盾（旧事实被新信息推翻）
- unrelated: 不相关（共存）

重要：
- 只有语义完全相同才算 duplicate
- 更新/修正不算 duplicate，算 contradicted
- 不同时间点的不同事件算 unrelated

输出 JSON：
{"results": [{"idx": <id>, "relation": "duplicate|contradicted|unrelated", "reason": "简短理由"}, ...]}"""

    facts_text = "\n".join(
        f"  [{f['idx']}] {f['fact']}"
        for f in existing_facts
    )
    user = f"""新事实：{new_fact}

已有事实：
{facts_text}

判断每条已有事实与新事实的关系。输出 JSON。"""

    return system, user


def timestamp_extraction_prompt(fact: str, reference_time: str) -> tuple[str, str]:
    """时间戳提取 Prompt"""
    system = """你是时间分析专家。从事实描述中提取时间信息。

规则：
- 持续为真的事实：valid_at 设为参考时间，invalid_at 为 null
- 已结束的事实：设置 invalid_at
- 无法判断时间的：两个字段都为 null
- 使用 ISO 8601 格式（如 2026-05-08T00:00:00Z）
- 相对时间（"去年"、"上周"）根据参考时间推算
- 只提到日期没提时间的，时间部分用 00:00:00

输出 JSON：
{"valid_at": "ISO8601 或 null", "invalid_at": "ISO8601 或 null"}"""

    user = f"""参考时间：{reference_time}
事实：{fact}

提取这个事实的时间范围。输出 JSON。"""

    return system, user
