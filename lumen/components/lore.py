"""
T24 LoreComponent — 世界书 + 知识库检索注入

从 query.py 提取三个注入逻辑：
1. _inject_worldbook() — 关键词匹配世界书条目
2. _inject_knowledge() — 语义路由知识库检索
3. _resolve_knowledge_placeholders() — system prompt 占位符解析

返回世界书 + 语义知识库检索结果的合并文本。
占位符解析通过 resolve_placeholders() 单独提供（需操作已组装的 system prompt）。
"""

import logging
from typing import Optional

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)


class LoreComponent(ContextComponent):
    """背景知识组件：世界书条目 + 知识库语义检索"""

    name = "lore"
    priority = 20  # Identity(10) → Lore(20) → Memory(30)
    zone = PromptZone.DYNAMIC  # 世界书匹配+语义检索每轮变化，放动态区

    async def pre_act(self, context: dict) -> str:
        character = context.get("character", {})
        user_input = context.get("user_input", "")
        character_id = context.get("character_id", "default")
        messages = context.get("messages", [])

        parts = []

        # 1. 世界书（关键词匹配）
        worldbook_text = self._get_worldbook_content(messages, character_id)
        if worldbook_text:
            parts.append(worldbook_text)

        # 2. 语义知识库检索
        knowledge_text = await self._get_semantic_knowledge(
            user_input, character,
        )
        if knowledge_text:
            parts.append(knowledge_text)

        return "\n\n".join(parts) if parts else ""

    def _get_worldbook_content(self, messages: list, character_id: str) -> str:
        """从世界书匹配关键词条目，合并所有匹配内容"""
        try:
            from lumen.prompt.worldbook_matcher import get_injection_context
            worldbook_contexts = get_injection_context(messages, character_id)
            if not worldbook_contexts:
                return ""
            return "\n\n".join(ctx["content"] for ctx in worldbook_contexts)
        except Exception as e:
            logger.debug(f"世界书匹配跳过: {e}")
            return ""

    async def _get_semantic_knowledge(
        self, user_input: str, character: dict,
    ) -> str:
        """语义路由：自动搜索知识库，返回格式化的检索结果"""
        knowledge_enabled = character.get("knowledge_enabled", True)
        semantic_routing = character.get("knowledge_semantic_routing", True)
        if not knowledge_enabled or not semantic_routing or not user_input:
            return ""

        from lumen.services.knowledge import search as knowledge_search
        from lumen.services.context.token_estimator import estimate_text_tokens

        top_k = character.get("knowledge_top_k", 3)
        min_score = character.get("knowledge_min_score", 0.3)
        if character.get("knowledge_token_budget"):
            token_budget = character["knowledge_token_budget"]
        else:
            from lumen.config import KNOWLEDGE_SEMANTIC_BUDGET
            token_budget = KNOWLEDGE_SEMANTIC_BUDGET

        results = await knowledge_search(user_input, top_k=top_k, min_score=min_score)
        if not results:
            return ""

        # Token 预算控制
        parts = []
        used_tokens = 0
        header_tokens = 60

        for hit in results:
            filename = hit.get("filename", "未知来源")
            content = hit.get("content", "")
            score = hit.get("score", 0)

            entry = f"[来源: {filename}，相关度: {score:.2f}]\n{content}"
            entry_tokens = estimate_text_tokens(entry)

            if used_tokens + entry_tokens + header_tokens > token_budget:
                break
            parts.append(entry)
            used_tokens += entry_tokens

        if not parts:
            return ""

        return (
            "<knowledge_base>\n"
            "以下是从知识库中检索到的参考资料，请据此回答用户问题。"
            "如果参考资料与问题无关，可以忽略。\n\n"
            + "\n\n".join(parts)
            + "\n</knowledge_base>"
        )

    async def resolve_placeholders(
        self,
        system_prompt: str,
        user_input: str,
        character: dict,
    ) -> tuple[str, bool, set[str]]:
        """解析 system prompt 中的知识库占位符（{{分类名}} / [[分类名]]）

        这个方法操作的是已组装的 system prompt 文本，
        由 session/environment 在拼装完所有 Component 后调用。

        Returns:
            (解析后的文本, 是否有占位符被解析, 已覆盖的 file_id 集合)
        """
        knowledge_enabled = character.get("knowledge_enabled", True)
        if not knowledge_enabled:
            return system_prompt, False, set()

        from lumen.prompt.knowledge_resolver import resolve

        resolved_text, has_placeholders, covered_ids, _ = await resolve(
            system_prompt,
            user_input,
            token_budget=character.get("knowledge_token_budget", 0) or None,
        )

        if has_placeholders:
            return resolved_text, True, covered_ids
        return system_prompt, False, set()
