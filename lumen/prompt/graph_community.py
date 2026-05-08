"""
图谱社群摘要 Prompt
为 Leiden 社区检测产出的每个社群生成名称 + 摘要
"""

_COMMUNITY_SUMMARY_SYSTEM = """你是社群分析专家。给定一组实体名称和它们之间的关系事实，你需要：

1. 找出这些实体共同构成的主题或社群
2. 用一句话给这个社群命名（简洁、有概括性）
3. 用 2-3 句话概括这个社群的核心特征和内部关系

## 输出格式
严格输出 JSON，不要额外文字：
{"name": "一句话名称", "summary": "2-3句摘要"}"""

_COMMUNITY_SUMMARY_USER = """请分析以下社群的实体和关系，给出社群名称和摘要。

## 实体列表
{entity_names}

## 关系事实
{edge_facts}

输出 JSON："""

_COMMUNITY_MERGE_SYSTEM = """你是社群层级整合专家。给定两个社群的摘要，你需要将它们合并成一个更宏观的摘要。

合并规则：
- 提取两者的共同主题
- 保留各自独特的要素
- 语言简洁，不超过 3 句话
- 如果两个社群关系不大，也要如实反映

## 输出格式
严格输出 JSON，不要额外文字：
{"summary": "合并后的摘要"}"""

_COMMUNITY_MERGE_USER = """请将以下两个社群摘要合并为一个更宏观的摘要。

## 社群 A 摘要
{summary_a}

## 社群 B 摘要
{summary_b}

输出 JSON："""


def community_summary_prompt(entity_names: str, edge_facts: str) -> tuple[str, str]:
    """生成社群摘要的 (system, user) 提示词

    Args:
        entity_names: 实体名称列表的格式化文本
        edge_facts: 边事实列表的格式化文本

    Returns:
        (system_prompt, user_prompt)
    """
    user = _COMMUNITY_SUMMARY_USER.format(
        entity_names=entity_names,
        edge_facts=edge_facts,
    )
    return _COMMUNITY_SUMMARY_SYSTEM, user


def community_merge_prompt(summary_a: str, summary_b: str) -> tuple[str, str]:
    """生成社群合并的 (system, user) 提示词

    Args:
        summary_a: 第一个社群的摘要
        summary_b: 第二个社群的摘要

    Returns:
        (system_prompt, user_prompt)
    """
    user = _COMMUNITY_MERGE_USER.format(
        summary_a=summary_a,
        summary_b=summary_b,
    )
    return _COMMUNITY_MERGE_SYSTEM, user
