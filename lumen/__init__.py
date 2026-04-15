"""
Lumen - AI 智能助手
核心模块包
"""

__version__ = "0.1.0"

# 会话管理（core/）
from lumen.core.session import ChatSession, SessionManager, get_session_manager

# 聊天功能（core/）
from lumen.core.chat import validate_tool_call, chat_stream, chat_non_stream

# 上下文管理（core/）
from lumen.core.context import trim_messages, fold_tool_calls, filter_for_ai

# 模块引用
from lumen.services import history
from lumen.services import memory

# 消息类型（types/）
from lumen.types.messages import (
    MessageType,
    MessageMetadata,
    create_message,
    create_tool_result_message,
    create_tool_result_parallel_message,
    is_tool_call_message,
    is_tool_result_message,
    is_folded,
)

# 角色提示词（prompt/）
from lumen.prompt.character import list_characters, load_character
from lumen.prompt.builder import build_system_prompt, build_messages

# 工具系统（tools/）
from lumen.tools.base import (
    get_tool_prompt,
    execute_tool,
    execute_tools_parallel,
    format_result_for_ai,
    ErrorCode,
    success_result,
    error_result,
)
from lumen.tools.parse import parse_tool_call

# 配置（顶层）
from lumen.config import client, get_model, DEFAULT_MODEL

# LLM 模块引用
from lumen.services import llm

__all__ = [
    # 会话管理
    "ChatSession",
    "SessionManager",
    "get_session_manager",

    # 聊天功能
    "validate_tool_call",
    "chat_stream",
    "chat_non_stream",

    # 上下文管理
    "trim_messages",
    "fold_tool_calls",
    "filter_for_ai",

    # 模块
    "history",
    "memory",
    "llm",

    # 消息类型
    "MessageType",
    "MessageMetadata",
    "create_message",
    "create_tool_result_message",
    "create_tool_result_parallel_message",
    "is_tool_call_message",
    "is_tool_result_message",
    "is_folded",

    # 角色提示词
    "list_characters",
    "load_character",
    "build_system_prompt",
    "build_messages",

    # 工具系统
    "get_tool_prompt",
    "execute_tool",
    "execute_tools_parallel",
    "parse_tool_call",
    "format_result_for_ai",
    "ErrorCode",
    "success_result",
    "error_result",

    # 配置
    "client",
    "get_model",
    "DEFAULT_MODEL",
]
