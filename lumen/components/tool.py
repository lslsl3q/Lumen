"""
T24 ToolComponent — 工具说明 + 角色保持指令

从 builder.py Layer 3+5 提取。
返回工具描述 XML + 角色保持指令（有工具 + 有 system_prompt 时追加）。
"""

import logging

from lumen.components.base import ContextComponent

logger = logging.getLogger(__name__)


class ToolComponent(ContextComponent):
    """工具说明组件：注入可用工具描述 + 角色保持指令"""

    name = "tool"
    priority = 90  # 最后注入：Identity(10) → ... → Tool(90)

    async def pre_act(self, context: dict) -> str:
        character = context.get("character", {})
        tools = character.get("tools", [])
        if not tools:
            return ""

        parts = []

        # Layer 3: 工具说明
        try:
            from lumen.prompt.tool_prompt import get_tool_prompt_from_registry
            tool_prompt = get_tool_prompt_from_registry(tools, character.get("tool_tips"))
            if tool_prompt:
                parts.append(tool_prompt)
        except Exception as e:
            logger.warning(f"工具说明生成失败: {e}")

        # Layer 5: 角色保持指令（有工具 + 有 system_prompt 时追加）
        if character.get("system_prompt"):
            parts.append(
                "【角色保持】\n"
                "无论你是在闲聊还是刚执行完工具调用，你对用户说的每一句话都必须符合你的角色设定。"
                "工具调用的 JSON 格式必须严格正确（不受角色影响），"
                "但最终呈现给用户的文字必须带有你独特的语气和性格。"
            )

        return "\n\n".join(parts) if parts else ""
