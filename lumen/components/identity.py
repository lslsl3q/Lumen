"""
T24 IdentityComponent — 角色身份 + Persona + 回复风格

从 builder.py Layer 1+2+2.5+2.7 提取。
返回角色核心文本（名字、描述、system_prompt、Persona、回复风格）。
"""

import logging

from lumen.components.base import ContextComponent

logger = logging.getLogger(__name__)

STYLE_MAP = {
    "brief": "回复要求：用最简洁的方式回答，直奔主题，不展开解释。除非用户明确要求详细说明。",
    "balanced": "回复要求：回答适度详细，解释清楚但不过度展开。对复杂问题逐步分析，对简单问题直接回答。",
    "detailed": "回复要求：尽可能详细地回答，包含完整的分析过程、多种视角的讨论、具体示例和注意事项。主动补充用户可能需要的关联信息。",
}


class IdentityComponent(ContextComponent):
    """角色身份组件：拼装角色名、描述、核心 prompt、Persona、回复风格"""

    name = "identity"
    priority = 10  # 最先注入：Identity(10)

    async def pre_act(self, context: dict) -> str:
        character = context.get("character", {})
        parts = []

        # Layer 1: 角色元数据
        if character.get("name"):
            parts.append(f"你的名字是{character['name']}。")
        if character.get("description"):
            parts.append(f"角色设定：{character['description']}。")

        # Layer 2: 角色核心 system_prompt
        if character.get("system_prompt"):
            parts.append(character["system_prompt"])

        # Layer 2.5: Persona
        try:
            from lumen.prompt.persona import get_active_persona_text
            persona_text = get_active_persona_text()
            if persona_text:
                parts.append(persona_text)
        except Exception:
            pass

        # Layer 2.7: 回复风格
        style = character.get("response_style", "balanced")
        if style in STYLE_MAP:
            parts.append(STYLE_MAP[style])

        return "\n\n".join(parts) if parts else ""
