"""
子代理扩展 — 注册 subagent_call 工具，让 AI 可以调用子代理完成子任务

架构：
- 主 Agent 在 ReAct 循环中调用 subagent_call 工具
- 工具创建临时子代理执行 LLM 调用，返回结果
- 子代理不带工具/记忆，避免无限嵌套
- 深度防护：contextvars 追踪嵌套层级，超限直接拦截
"""

import logging

logger = logging.getLogger(__name__)


def register(bus) -> None:
    """扩展入口：注册 subagent_call 工具"""
    from .tool_def import TOOL_DEFINITION, execute

    bus.register_tool("subagent_call", TOOL_DEFINITION)

    from lumen.tool import register_handler
    register_handler("subagent_call", execute)

    logger.info("Subagent extension: registered subagent_call tool")


def unregister(bus) -> None:
    """热重载清理"""
    from lumen.tool import unregister_handler
    unregister_handler("subagent_call")

    bus.unregister_tool("subagent_call")

    logger.info("Subagent extension: unregistered subagent_call tool")
