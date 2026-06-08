"""
工具调用日志扩展 — 记录所有工具调用的耗时和结果

示例扩展，证明扩展系统能正常工作。
"""

import logging
import time

from lumen.core.hook_bus import HookBus
from lumen.core.hook_types import ToolCallPayload, ToolResultPayload

logger = logging.getLogger(__name__)

# 工具调用开始时间缓存
_call_start: dict[str, float] = {}


def register(bus: HookBus) -> None:
    """扩展入口：注册事件钩子"""

    async def on_tool_call(payload: ToolCallPayload) -> None:
        _call_start[payload.tool_name] = time.perf_counter()
        logger.info(f"[Ext] 工具调用: {payload.tool_name}({payload.tool_params})")

    async def on_tool_result(payload: ToolResultPayload) -> None:
        elapsed = time.perf_counter() - _call_start.pop(payload.tool_name, time.perf_counter())
        status = "ok" if payload.result.get("success") else "fail"
        logger.info(f"[Ext] 工具结果: {payload.tool_name} → {status} ({elapsed:.1f}ms)")

    bus.register("tool.call", on_tool_call, priority=99, name="ext.tool_logger.call")
    bus.register("tool.result", on_tool_result, priority=99, name="ext.tool_logger.result")


def unregister(bus: HookBus) -> None:
    """热重载清理"""
    bus.unregister("tool.call", "ext.tool_logger.call")
    bus.unregister("tool.result", "ext.tool_logger.result")
    _call_start.clear()
    logger.info("ToolLogger extension: unregistered handlers")
