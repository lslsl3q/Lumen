"""
T22 GM 裁决 Prompt 加载器

从 lumen/data/gm/resolution_prompt.md 加载提示词，支持热编辑。
Concordia 4 步链式思考浓缩为单次 JSON 输出。
"""

import os
import logging

logger = logging.getLogger(__name__)

_PROMPT_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "gm", "resolution_prompt.md"
)

# ── 内置默认值（文件不存在时回退）──

_DEFAULT_FULL_SYSTEM = """你是一个**游戏主持人（Game Master）裁决引擎**。对行动进行裁决——判断成功、推导因果、生成叙事。

裁决四步法（内部思考，不输出中间步骤）：
1. 合理性判定 — 行动在物理/社会/规则下是否可能？行动者能力是否支持？
2. 因果推导 — 行动成功的因果链或失败的根因
3. 结果推演 — 列举 2+ 可能结果，选最合理的
4. 自主性校验 — 不替其他角色做内心决定，只描述可观察反应

输出 JSON：
{"success": bool, "success_reason": "详细原因", "causal_statement": "因果链", "most_likely_outcome": "最合理结果", "alternative_outcomes": ["备选"], "affected_entities": ["实体名"], "agency_check": {"实体": "preserved/compromised - 说明"}, "world_state_changes": {"变量": "新值"}, "emotional_valence": "anxiety/anger/fear/sadness/joy/calm/neutral", "narrative": "最终叙事文本", "needs_follow_up": bool, "follow_up_hint": "后续提示"}"""

_DEFAULT_FULL_USER = """### 当前世界状态
{world_state}

### 当前场景
{scene_context}

### 行动者
{actor_name}（{actor_description}）

### 行动内容
{action_content}

### 相关实体
{related_entities}

---
请按四步裁决法分析以上行动，输出 JSON："""

_DEFAULT_LIGHT_SYSTEM = """你是一个快速裁决助手。日常场景中快速判断行动结果，不需要详细推理。

输出 JSON：
{"success": bool, "outcome": "简洁结果 1-2 句", "emotional_shift": "情绪变化或null", "needs_attention": bool}"""

_DEFAULT_LIGHT_USER = """### 当前上下文
{context}

### 行动内容
{action_content}

---
请快速裁决以上行动，输出 JSON："""


# ── 文件解析 ──

def _parse_prompt_file(content: str) -> dict:
    """从 markdown 文件解析完整版和轻量版的提示词

    格式：
      ## 完整版系统提示词
      <内容>
      ## 轻量版系统提示词
      <内容>
      ## 完整版用户提示词模板
      <内容>
      ## 轻量版用户提示词模板
      <内容>
    """
    result = {
        "full_system": _DEFAULT_FULL_SYSTEM,
        "full_user": _DEFAULT_FULL_USER,
        "light_system": _DEFAULT_LIGHT_SYSTEM,
        "light_user": _DEFAULT_LIGHT_USER,
    }

    sections = {
        "## 完整版系统提示词": "full_system",
        "## 轻量版系统提示词": "light_system",
        "## 完整版用户提示词模板": "full_user",
        "## 轻量版用户提示词模板": "light_user",
    }

    for marker, key in sections.items():
        parts = content.split(marker)
        if len(parts) >= 2:
            # 取该节到下一个 ## 之间的内容
            section_content = parts[1]
            next_section = section_content.find("\n## ")
            if next_section != -1:
                section_content = section_content[:next_section]
            section_text = section_content.strip()
            if section_text:
                result[key] = section_text

    return result


def load_prompts() -> dict:
    """从文件加载提示词（每次调用都读文件，支持热编辑）

    Returns:
        {"full_system": str, "full_user": str, "light_system": str, "light_user": str}
    """
    try:
        with open(_PROMPT_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        return _parse_prompt_file(content)
    except FileNotFoundError:
        logger.info(f"GM 裁决提示词文件不存在，使用内置默认值: {_PROMPT_FILE}")
        return {
            "full_system": _DEFAULT_FULL_SYSTEM,
            "full_user": _DEFAULT_FULL_USER,
            "light_system": _DEFAULT_LIGHT_SYSTEM,
            "light_user": _DEFAULT_LIGHT_USER,
        }
    except Exception as e:
        logger.warning(f"GM 裁决提示词文件读取失败，使用内置默认值: {e}")
        return {
            "full_system": _DEFAULT_FULL_SYSTEM,
            "full_user": _DEFAULT_FULL_USER,
            "light_system": _DEFAULT_LIGHT_SYSTEM,
            "light_user": _DEFAULT_LIGHT_USER,
        }


def get_prompt_file_path() -> str:
    """返回提示词文件路径（API 用）"""
    return _PROMPT_FILE


def get_default_prompts() -> dict:
    """返回内置默认提示词（API 用，用于重置）"""
    return {
        "full_system": _DEFAULT_FULL_SYSTEM,
        "full_user": _DEFAULT_FULL_USER,
        "light_system": _DEFAULT_LIGHT_SYSTEM,
        "light_user": _DEFAULT_LIGHT_USER,
    }


# ── 便捷函数 ──

def get_full_prompts() -> tuple[str, str]:
    """获取完整版 (system_prompt, user_template)"""
    prompts = load_prompts()
    return prompts["full_system"], prompts["full_user"]


def get_light_prompts() -> tuple[str, str]:
    """获取轻量版 (system_prompt, user_template)"""
    prompts = load_prompts()
    return prompts["light_system"], prompts["light_user"]


def build_full_user_prompt(
    *,
    world_state: str = "",
    scene_context: str = "",
    actor_name: str = "",
    actor_description: str = "",
    action_content: str = "",
    related_entities: str = "",
) -> str:
    """构建完整版用户提示词"""
    _, template = get_full_prompts()
    return template.format(
        world_state=world_state or "（无预设世界状态）",
        scene_context=scene_context or "（当前无特定场景）",
        actor_name=actor_name or "未知",
        actor_description=actor_description or "无描述",
        action_content=action_content,
        related_entities=related_entities or "无",
    )


def build_light_user_prompt(
    *,
    context: str = "",
    action_content: str = "",
) -> str:
    """构建轻量版用户提示词"""
    _, template = get_light_prompts()
    return template.format(
        context=context or "（无特定上下文）",
        action_content=action_content,
    )
