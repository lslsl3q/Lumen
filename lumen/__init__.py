"""
Lumen - AI 智能助手
核心模块包
"""

__version__ = "0.1.0"

from .chat import load, chat_stream, reset
from .context import trim_messages, fold_tool_calls, filter_for_ai
from . import history
from . import memory
from .message_types import (
    MessageType,
    MessageMetadata,
    create_message,
    create_tool_result_message,
    create_tool_result_parallel_message,
    is_tool_call_message,
    is_tool_result_message,
    is_folded,
)
from .prompt import list_characters, load_character, build_system_prompt, build_messages
from .tools import (
    TOOL_DEFINITIONS,
    get_tool_prompt,
    execute_tool,
    execute_tools_parallel,
    parse_tool_call,
    format_result_for_ai,
    ErrorCode,
    success_result,
    error_result
)
from .config import client, get_model, DEFAULT_MODEL
from . import llm

__all__ = [
    "load",
    "chat_stream",
    "reset",
    "trim_messages",
    "fold_tool_calls",
    "filter_for_ai",
    "history",
    "memory",
    "MessageType",
    "MessageMetadata",
    "create_message",
    "create_tool_result_message",
    "create_tool_result_parallel_message",
    "is_tool_call_message",
    "is_tool_result_message",
    "is_folded",
    "list_characters",
    "load_character",
    "build_system_prompt",
    "build_messages",
    "TOOL_DEFINITIONS",
    "get_tool_prompt",
    "execute_tool",
    "execute_tools_parallel",
    "parse_tool_call",
    "format_result_for_ai",
    "ErrorCode",
    "success_result",
    "error_result",
    "client",
    "get_model",
    "DEFAULT_MODEL",
    "llm",
]
