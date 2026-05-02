"""
Lumen - 查询引擎

T24 清理后：流式路径已迁至 agent_chat.py，本文件只保留：
- chat_non_stream: 非流式入口（委托给 Agent 路径）
- validate_tool_call: 工具验证（公共函数）
"""

import logging

import jsonschema

from lumen.core.session import ChatSession
from lumen.tools.registry import get_registry

logger = logging.getLogger(__name__)


def validate_tool_call(tool_name: str, tool_params: dict, command: str = "") -> str | None:
    """验证 AI 的工具调用是否正确

    Returns:
        None 如果验证通过，错误消息字符串如果验证失败
    """
    registry = get_registry()

    if not registry.exists(tool_name):
        available = registry.list_tools()
        return f"工具 '{tool_name}' 不存在，可用工具: {', '.join(available)}"

    tool_def = registry.get_tool(tool_name)

    commands = tool_def.get("commands", {})
    if commands:
        if not command:
            return f"工具 '{tool_name}' 需要 command 参数，可用命令: {', '.join(commands.keys())}"
        if command not in commands:
            return f"工具 '{tool_name}' 没有命令 '{command}'，可用命令: {', '.join(commands.keys())}"
        params_schema = commands[command].get("parameters", {})
    else:
        params_schema = tool_def.get("parameters", {})

    try:
        jsonschema.validate(instance=tool_params, schema=params_schema)
    except jsonschema.ValidationError as e:
        return f"参数验证失败: {e.message}"

    return None


async def chat_non_stream(user_input: str, session: ChatSession, response_style: str = "balanced") -> str:
    """非流式：复用 Agent 路径，收集所有 text 事件拼接成完整回复"""
    from lumen.agent_chat import agent_chat_stream

    reply_parts = []
    async for event in agent_chat_stream(user_input, session, response_style=response_style):
        if event.get("type") == "text":
            reply_parts.append(event["content"])

    return "".join(reply_parts)
