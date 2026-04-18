"""
Lumen - 消息类型和元数据定义
支持上下文折叠的消息类型系统

只放类型定义和常量，不放业务逻辑
"""

from typing import TypedDict


# ========================================
# 消息类型定义
# ========================================

class MessageType:
    """消息类型常量"""
    NORMAL = "normal"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOOL_RESULT_PARALLEL = "tool_result_parallel"


# ========================================
# 消息类型（TypedDict — 内部传递，零开销）
# ========================================

class MessageMetadata(TypedDict, total=False):
    """消息元数据"""
    type: str
    folded: bool
    tool_name: str
    tool_count: int


class Message(TypedDict, total=False):
    """聊天消息"""
    role: str
    content: str
    metadata: MessageMetadata
