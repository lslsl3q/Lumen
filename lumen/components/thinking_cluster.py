"""
T24 ThinkingClusterComponent — 思维簇管道注入

从 query.py::_inject_thinking_clusters() 提取。
执行思维簇检索管道，返回 <thinking_modules> 文本块。
"""

import logging

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)


class ThinkingClusterComponent(ContextComponent):
    """思维簇组件：检索与用户输入相关的思维模块，注入思考框架"""

    name = "thinking_cluster"
    priority = 60  # Identity(10) → Lore(20) → Memory(30) → Skills(50) → ThinkingCluster(60)
    zone = PromptZone.DYNAMIC  # 向量检索依赖用户输入，每轮变化

    async def pre_act(self, context: dict) -> str:
        character = context.get("character", {})
        if not character.get("thinking_clusters_enabled", False):
            return ""

        user_input = context.get("user_input", "")
        if not user_input:
            return ""

        try:
            from lumen.services.thinking_clusters import run_chain, get_chain_config, ensure_indexed
            from lumen.services.embedding import get_service
        except ImportError:
            return ""

        chain_name = character.get("thinking_clusters_chain", "default")
        chain = get_chain_config(chain_name)
        if not chain.steps:
            return ""

        await ensure_indexed()

        backend = await get_service("thinking_clusters")
        if not backend:
            return ""
        query_vector = await backend.encode(user_input)
        if not query_vector:
            return ""

        result = await run_chain(query_vector, chain, character)
        if not result["injection_text"]:
            return ""

        logger.debug(
            f"ThinkingClusterComponent: {len(result['modules'])} 模块, "
            f"{result['total_tokens']} tokens"
        )
        return result["injection_text"]
