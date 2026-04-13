"""
Lumen - AI 智能助手
核心模块包
"""

__version__ = "0.1.0"

from .chat import load, chat_stream, reset
from .context import trim_messages
from . import history
from . import memory
from .prompt import list_characters, load_character, build_system_prompt, build_messages
from .tools import TOOL_DEFINITIONS, get_tool_prompt, execute_tool, parse_tool_call

__all__ = [
    "load",
    "chat_stream",
    "reset",
    "trim_messages",
    "history",
    "memory",
    "list_characters",
    "load_character",
    "build_system_prompt",
    "build_messages",
    "TOOL_DEFINITIONS",
    "get_tool_prompt",
    "execute_tool",
    "parse_tool_call",
]
