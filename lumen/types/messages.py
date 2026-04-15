"""
Lumen - 消息类型和元数据定义

支持上下文折叠的消息类型系统
"""

from typing import Dict, Any, Optional, List
from datetime import datetime


# ========================================
# 消息类型定义
# ========================================

class MessageType:
    """消息类型常量"""
    NORMAL = "normal"           # 普通对话消息
    TOOL_CALL = "tool_call"     # 工具调用（assistant 输出的 JSON）
    TOOL_RESULT = "tool_result" # 工具结果（user 返回的完整结果）
    TOOL_RESULT_PARALLEL = "tool_result_parallel"  # 并行工具结果


# ========================================
# 消息元数据
# ========================================

class MessageMetadata:
    """消息元数据

    用于支持消息折叠、前端展示等功能
    """

    def __init__(self,
                 msg_type: str = MessageType.NORMAL,
                 folded: bool = False,
                 tool_name: str = None,
                 tool_count: int = None,
                 **kwargs):
        """初始化消息元数据

        Args:
            msg_type: 消息类型
            folded: 是否折叠（折叠后不发送给 AI，但保留用于前端展示）
            tool_name: 工具名称（工具相关消息）
            tool_count: 工具数量（并行工具调用）
            **kwargs: 其他扩展字段
        """
        self.msg_type = msg_type
        self.folded = folded
        self.tool_name = tool_name
        self.tool_count = tool_count
        self.extra = kwargs

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        result = {
            "type": self.msg_type,
            "folded": self.folded
        }
        if self.tool_name:
            result["tool_name"] = self.tool_name
        if self.tool_count is not None:
            result["tool_count"] = self.tool_count
        result.update(self.extra)
        return result

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> 'MessageMetadata':
        """从字典创建元数据"""
        extra = {k: v for k, v in data.items()
                 if k not in ["type", "folded", "tool_name", "tool_count"]}
        return MessageMetadata(
            msg_type=data.get("type", MessageType.NORMAL),
            folded=data.get("folded", False),
            tool_name=data.get("tool_name"),
            tool_count=data.get("tool_count"),
            **extra
        )


# ========================================
# 消息辅助函数
# ========================================

def create_message(role: str,
                   content: str,
                   msg_type: str = MessageType.NORMAL,
                   **metadata_kwargs) -> Dict[str, Any]:
    """创建带有元数据的消息

    Args:
        role: 消息角色（user/assistant/system）
        content: 消息内容
        msg_type: 消息类型
        **metadata_kwargs: 元数据字段

    Returns:
        完整的消息字典
    """
    metadata = MessageMetadata(msg_type=msg_type, **metadata_kwargs)
    return {
        "role": role,
        "content": content,
        "metadata": metadata.to_dict()
    }


def create_tool_call_message(tool_name: str, params: Dict,
                               run_in_background: bool = False) -> Dict[str, Any]:
    """创建工具调用消息（新格式）

    Args:
        tool_name: 工具名称
        params: 工具参数
        run_in_background: 是否后台运行

    Returns:
        工具调用消息字典
    """
    import json
    import uuid
    from datetime import datetime

    # 生成唯一调用 ID
    call_id = f"call_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    # 构建新格式的工具调用
    tool_call = {
        "type": "tool_call",
        "id": call_id,
        "tool": tool_name,
        "params": params
    }

    # 可选参数
    if run_in_background:
        tool_call["run_in_background"] = True

    return create_message(
        role="assistant",
        content=json.dumps(tool_call, ensure_ascii=False),
        msg_type=MessageType.TOOL_CALL,
        tool_name=tool_name,
        tool_call_id=call_id  # 记录调用 ID 到元数据
    )


def create_tool_result_message(result: Dict[str, Any],
                                 tool_call_id: Optional[str] = None) -> Dict[str, Any]:
    """创建工具结果消息（新格式）

    Args:
        result: 工具执行结果（来自 execute_tool）
        tool_call_id: 关联的工具调用 ID

    Returns:
        工具结果消息字典
    """
    import json

    # 构建新格式的工具结果
    tool_result = {
        "type": "tool_result",
        "tool_call_id": tool_call_id,
        "result": result
    }

    return create_message(
        role="user",
        content=json.dumps(tool_result, ensure_ascii=False),
        msg_type=MessageType.TOOL_RESULT,
        tool_name=result.get("tool"),
        tool_call_id=tool_call_id,
        folded=False
    )


def create_tool_result_parallel_message(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """创建并行工具结果消息"""
    import json
    return create_message(
        role="user",
        content=json.dumps(results, ensure_ascii=False),
        msg_type=MessageType.TOOL_RESULT_PARALLEL,
        tool_count=len(results),
        folded=False
    )


def is_tool_call_message(msg: Dict[str, Any]) -> bool:
    """判断是否是工具调用消息"""
    metadata = msg.get("metadata", {})
    return metadata.get("type") == MessageType.TOOL_CALL


def is_tool_result_message(msg: Dict[str, Any]) -> bool:
    """判断是否是工具结果消息"""
    metadata = msg.get("metadata", {})
    msg_type = metadata.get("type")
    return msg_type in [MessageType.TOOL_RESULT, MessageType.TOOL_RESULT_PARALLEL]


def is_folded(msg: Dict[str, Any]) -> bool:
    """判断消息是否已折叠"""
    metadata = msg.get("metadata", {})
    return metadata.get("folded", False)


# ========================================
# 折叠相关常量
# ========================================

class FoldReason:
    """折叠原因"""
    AI_PROCESSED = "ai_processed"  # AI 已处理，结果已输出
    OLD_TOKEN_LIMIT = "old_token_limit"  # 超出 token 限制
    USER_REQUEST = "user_request"  # 用户手动折叠


# 导出
__all__ = [
    "MessageType",
    "MessageMetadata",
    "FoldReason",
    "create_message",
    "create_tool_call_message",
    "create_tool_result_message",
    "create_tool_result_parallel_message",
    "is_tool_call_message",
    "is_tool_result_message",
    "is_folded",
]
