"""
Lumen - 上下文管理模块

对外暴露三个核心接口：
- fold_tool_calls: 折叠历史工具调用
- filter_for_ai: 过滤已折叠的消息
- trim_messages: 按条数裁剪历史

内部实现细节在 manager.py 中，外部只需 from lumen.services.context import xxx
"""

from lumen.services.context.manager import (
    fold_tool_calls,
    filter_for_ai,
    trim_messages,
)

__all__ = [
    "fold_tool_calls",
    "filter_for_ai",
    "trim_messages",
]
