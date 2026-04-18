"""
Lumen - 上下文管理模块

对外暴露核心接口：
- fold_tool_calls: 折叠历史工具调用
- filter_for_ai: 过滤已折叠的消息
- trim_messages: 按条数裁剪历史
- estimate_messages_tokens: 估算消息 token 数
"""

from lumen.services.context.manager import (
    fold_tool_calls,
    filter_for_ai,
    trim_messages,
)
from lumen.services.context.token_estimator import (
    estimate_messages_tokens,
    estimate_text_tokens,
    extract_usage,
    record_usage,
    get_session_usage,
)

__all__ = [
    "fold_tool_calls",
    "filter_for_ai",
    "trim_messages",
    "estimate_messages_tokens",
    "estimate_text_tokens",
    "extract_usage",
    "record_usage",
    "get_session_usage",
]
