"""
T25 多 Agent 通信消息类型

MessageBus 上流转的消息格式。
内部传递用 TypedDict（零开销），边界用 Pydantic。
"""

from enum import Enum
from typing import TypedDict, Optional, Any


class MsgType(str, Enum):
    """消息类型"""
    # 基础
    CHAT = "chat"                           # 用户聊天消息
    SYSTEM = "system"                       # 系统通知（裁决结果、环境事件）
    OBSERVATION = "observation"             # 观察投递（NPC 看到的事件）
    DIRECTOR_INSTRUCT = "director_instruct" # GM → NPC 的行为指令

    # RPG
    ACTION = "action"                       # 玩家/角色行动（需裁决）
    DICE_RESULT = "dice_result"             # 掷骰结果

    # 状态
    STATE_CHANGE = "state_change"           # 世界状态变更通知
    MIGRATION = "migration"                 # Agent 迁移环境通知


class AgentMessage(TypedDict, total=False):
    """Agent 间通信的消息格式"""
    type: str                   # MsgType value
    sender_id: str              # 发送者 Agent ID
    target_id: str              # 目标 Agent ID（None 表示广播）
    room_id: str                # 房间/场景 ID
    content: str                # 消息正文
    metadata: dict[str, Any]    # 扩展字段（骰子结果、裁决详情等）
