"""
Lumen 工具系统 — 对外统一接口
"""

from lumen.tools.base import (
    ErrorCode,
    success_result,
    error_result,
    format_result_for_ai,
    execute_tool,
    execute_tools_parallel,
    get_tool_prompt,
    get_tool_prompt_from_registry,
)
from lumen.tools.parse import parse_tool_call
from lumen.tools.registry import get_registry, ToolRegistry

__all__ = [
    "ErrorCode",
    "success_result",
    "error_result",
    "format_result_for_ai",
    "execute_tool",
    "execute_tools_parallel",
    "parse_tool_call",
    "get_tool_prompt",
    "get_tool_prompt_from_registry",
    "get_registry",
    "ToolRegistry",
]
