"""
Lumen - WebSocket 推送事件类型
AI 主动推送的事件，通过 WebSocket 通道发送。
全部 TypedDict（内部使用，零开销）。
"""

from typing import TypedDict, Optional, Any, Literal, Union


class AIMessageEvent(TypedDict):
    """AI 主动发起的消息"""
    type: Literal["ai_message"]
    session_id: str          # 属于哪个会话
    content: str             # 消息内容
    character_id: str        # 哪个角色发的
    timestamp: str           # ISO 8601


class HeartbeatEvent(TypedDict):
    """心跳保活"""
    type: Literal["heartbeat"]
    timestamp: str


class NotificationEvent(TypedDict, total=False):
    """任务通知（报告生成、任务完成等）"""
    type: Literal["notification"]
    title: str               # 通知标题
    body: str                # 通知内容
    level: str               # "info" | "warning" | "success" | "error"
    timestamp: str
    data: Any                # 可选的附加数据


class SystemEvent(TypedDict):
    """系统状态消息"""
    type: Literal["system"]
    status: str              # "backend_ready" | "model_changed" 等
    message: str
    timestamp: str


# 所有推送事件的联合类型
PushEvent = Union[AIMessageEvent, HeartbeatEvent, NotificationEvent, SystemEvent]
