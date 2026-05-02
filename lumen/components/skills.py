"""
T24 SkillsComponent — 技能内容注入

从 builder.py Layer 2.6 提取。
渐进式披露：清单始终注入 + 完整内容受 token 预算控制。
"""

import logging

from lumen.components.base import ContextComponent

logger = logging.getLogger(__name__)


class SkillsComponent(ContextComponent):
    """技能组件：注入角色可用的技能描述和内容"""

    name = "skills"
    priority = 50  # Identity(10) → Lore(20) → Memory(30) → Skills(50)

    async def pre_act(self, context: dict) -> str:
        character = context.get("character", {})
        if not character.get("skills"):
            return ""

        try:
            from lumen.prompt.skill_store import get_skills_content
            skills_text = get_skills_content(character["skills"], token_budget=800)
            return skills_text or ""
        except Exception as e:
            logger.debug(f"SkillsComponent 跳过: {e}")
            return ""
