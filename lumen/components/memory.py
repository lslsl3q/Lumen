"""
T24 MemoryComponent — 跨会话记忆检索与注入

从 query.py::_inject_relevant_memories() 提取。
基于用户输入搜索历史消息，返回 <relevant_history> 文本块。
"""

import logging

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)


class MemoryComponent(ContextComponent):
    """跨会话记忆组件：语义搜索历史消息，注入相关回忆"""

    name = "memory"
    priority = 30  # Identity(10) → Lore(20) → Memory(30)
    zone = PromptZone.DYNAMIC  # 记忆召回每轮不同，放动态区不破坏缓存前缀

    async def pre_act(self, context: dict) -> str:
        character = context.get("character", {})
        if not character.get("memory_enabled", True):
            return ""

        user_input = context.get("user_input", "")
        character_id = context.get("character_id", "default")
        session_id = context.get("session_id", "")

        if not user_input:
            return ""

        token_budget = character.get("memory_token_budget", 300)
        auto_summarize = character.get("memory_auto_summarize", False)

        from lumen.services.memory import get_relevant_memories

        memory_text, recall_log = await get_relevant_memories(
            user_input,
            character_id,
            token_budget=token_budget,
            auto_summarize=auto_summarize,
            session_id=session_id,
        )

        if recall_log:
            logger.debug(f"MemoryComponent 召回: {len(recall_log)} 条")

        return memory_text or ""
