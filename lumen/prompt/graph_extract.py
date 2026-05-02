"""
T19 图谱提取 Prompt
从 lumen/data/graph/extract_prompt.md 加载提示词，支持热编辑
"""

import os
import logging

logger = logging.getLogger(__name__)

_PROMPT_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "graph", "extract_prompt.md"
)

# 内置默认值（文件不存在时回退）
_DEFAULT_SYSTEM = """你是一个知识图谱抽取器。从给定的文本中识别实体和实体之间的关系。

## 实体类型
- Character: 人物/角色（真实或虚构）
- Location: 地点/场景（城市、建筑、房间、国家等）
- Item: 物品/道具（有具体名称的物件）
- Organization: 组织/团体（公司、门派、政府机构、帮派等）
- Event: 事件（战斗、会议、庆典、灾难等有名称的事件）
- Concept: 概念/抽象实体（功法、技术、理论、规则等有名称的抽象物）

## 排除规则
以下内容不提取为实体：
- 代词（我、你、他、她、它、我们、你们、他们）
- 泛称（人、东西、事情、地方、时候）
- 裸关系词（在、是、有、做、说、去、来、给）
- 时间描述（今天、昨天、明天、早上、晚上）
- 量词/数词（一个、一些、很多、第一）

## 关系提取
- label 用简洁的动词或介词短语（如 "认识"、"住在"、"拥有"、"属于"、"击败"、"位于"）
- 只提取文本中明确提及的关系，不推测

## 输出格式
严格输出 JSON，不要额外文字：
{"entities": [{"name": "实体名", "type": "Character", "aliases": ["别名1"], "extra": {"描述": "..."}}], "edges": [{"src_name": "实体A", "dst_name": "实体B", "label": "关系"}]}"""

_DEFAULT_USER = """请从以下文本中提取实体和关系。

---
{content}
---

输出 JSON："""


def _parse_prompt_file(content: str) -> tuple[str, str]:
    """从 markdown 文件内容解析系统提示词和用户提示词模板

    格式：以 ## 系统提示词 和 ## 用户提示词模板 为分隔
    """
    parts = content.split("## 系统提示词")
    if len(parts) < 2:
        return _DEFAULT_SYSTEM, _DEFAULT_USER

    after_system = parts[1]
    sub_parts = after_system.split("## 用户提示词模板")
    if len(sub_parts) < 2:
        return _DEFAULT_SYSTEM, _DEFAULT_USER

    system_prompt = sub_parts[0].strip()
    user_template = sub_parts[1].strip()

    if not system_prompt or not user_template:
        return _DEFAULT_SYSTEM, _DEFAULT_USER

    return system_prompt, user_template


def load_prompts() -> tuple[str, str]:
    """从文件加载提示词（每次调用都读文件，支持热编辑）

    Returns:
        (system_prompt, user_template)
    """
    try:
        with open(_PROMPT_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        return _parse_prompt_file(content)
    except FileNotFoundError:
        logger.info(f"图谱提示词文件不存在，使用内置默认值: {_PROMPT_FILE}")
        return _DEFAULT_SYSTEM, _DEFAULT_USER
    except Exception as e:
        logger.warning(f"图谱提示词文件读取失败，使用内置默认值: {e}")
        return _DEFAULT_SYSTEM, _DEFAULT_USER


def get_prompt_file_path() -> str:
    """返回提示词文件路径（API 用）"""
    return _PROMPT_FILE


def get_default_prompts() -> tuple[str, str]:
    """返回内置默认提示词（API 用，用于重置）"""
    return _DEFAULT_SYSTEM, _DEFAULT_USER


# 向后兼容：模块级常量（首次加载时的值）
GRAPH_EXTRACT_SYSTEM, GRAPH_EXTRACT_USER = load_prompts()
