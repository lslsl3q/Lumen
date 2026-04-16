"""
Lumen - 消息类型和元数据定义
支持上下文折叠的消息类型系统
"""

import json
import uuid
from datetime import datetime
from typing import TypedDict, Optional, List, Dict, Any


# ========================================
# 消息类型定义
# ========================================

class MessageType:
    """消息类型常量"""
    NORMAL = "normal"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOOL_RESULT_PARALLEL = "tool_result_parallel"


class FoldReason:
    """折叠原因"""
    AI_PROCESSED = "ai_processed"
    OLD_TOKEN_LIMIT = "old_token_limit"
    USER_REQUEST = "user_request"


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


# ========================================
# 消息辅助函数
# ========================================

def create_message(role: str,
                   content: str,
                   msg_type: str = MessageType.NORMAL,
                   **metadata_kwargs) -> Message:
    """创建带有元数据的消息

    Args:
        role: 消息角色（user/assistant/system）
        content: 消息内容
        msg_type: 消息类型
        **metadata_kwargs: 额外的元数据字段（tool_name, tool_call_id 等）

    Returns:
        完整的消息字典
    """
    metadata: MessageMetadata = {"type": msg_type, **metadata_kwargs}
    metadata.setdefault("folded", False)
    return {
        "role": role,
        "content": content,
        "metadata": metadata,
    }


def create_tool_call_message(tool_name: str, params: Dict,
                              run_in_background: bool = False) -> Message:
    """创建工具调用消息

    Args:
        tool_name: 工具名称
        params: 工具参数
        run_in_background: 是否后台运行

    Returns:
        工具调用消息字典
    """
    call_id = f"call_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    tool_call = {
        "type": "tool_call",
        "id": call_id,
        "tool": tool_name,
        "params": params,
    }

    if run_in_background:
        tool_call["run_in_background"] = True

    return create_message(
        role="assistant",
        content=json.dumps(tool_call, ensure_ascii=False),
        msg_type=MessageType.TOOL_CALL,
        tool_name=tool_name,
        tool_call_id=call_id,
    )


def create_tool_result_message(result: Dict[str, Any],
                                tool_call_id: Optional[str] = None) -> Message:
    """创建工具结果消息

    Args:
        result: 工具执行结果（来自 execute_tool）
        tool_call_id: 关联的工具调用 ID

    Returns:
        工具结果消息字典
    """
    tool_result = {
        "type": "tool_result",
        "tool_call_id": tool_call_id,
        "result": result,
    }

    return create_message(
        role="user",
        content=json.dumps(tool_result, ensure_ascii=False),
        msg_type=MessageType.TOOL_RESULT,
        tool_name=result.get("tool"),
        tool_call_id=tool_call_id,
        folded=False,
    )


def create_tool_result_parallel_message(results: List[Dict[str, Any]]) -> Message:
    """创建并行工具结果消息"""
    return create_message(
        role="user",
        content=json.dumps(results, ensure_ascii=False),
        msg_type=MessageType.TOOL_RESULT_PARALLEL,
        tool_count=len(results),
        folded=False,
    )


def is_tool_call_message(msg: Message) -> bool:
    """判断是否是工具调用消息"""
    metadata = msg.get("metadata", {})
    return metadata.get("type") == MessageType.TOOL_CALL


def is_tool_result_message(msg: Message) -> bool:
    """判断是否是工具结果消息"""
    metadata = msg.get("metadata", {})
    msg_type = metadata.get("type")
    return msg_type in [MessageType.TOOL_RESULT, MessageType.TOOL_RESULT_PARALLEL]


def is_folded(msg: Message) -> bool:
    """判断消息是否已折叠"""
    metadata = msg.get("metadata", {})
    return metadata.get("folded", False)


# ========================================
# 导出
# ========================================

__all__ = [
    "MessageType",
    "MessageMetadata",
    "Message",
    "FoldReason",
    "create_message",
    "create_tool_call_message",
    "create_tool_result_message",
    "create_tool_result_parallel_message",
    "is_tool_call_message",
    "is_tool_result_message",
    "is_folded",
]
