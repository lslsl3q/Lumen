"""HookBus 事件类型定义 — 所有 Payload 使用 Pydantic BaseModel"""

from typing import Optional

from pydantic import BaseModel


class HookEvent(BaseModel):
    """所有 HookEvent 的基类"""
    event_name: str
    timestamp: float = 0.0


class RPGActionBeforePayload(HookEvent):
    event_name: str = "rpg.action.before"
    character_id: str = ""
    user_input: str = ""
    room_id: str = ""
    campaign_id: str = ""


class RPGActionCompletedPayload(HookEvent):
    event_name: str = "rpg.action.completed"
    action_type: str = ""
    actor_id: str = ""
    target_id: Optional[str] = None
    room_id: str = ""
    result_text: str = ""


class TurnEndedPayload(HookEvent):
    event_name: str = "turn.ended"
    turn_number: int = 0
    session_id: str = ""


class RPGSceneEnterPayload(HookEvent):
    event_name: str = "rpg.scene.enter"
    scene_id: str = ""
    room_id: str = ""
    description: str = ""


class ForeshadowingPayload(HookEvent):
    event_name: str = "plot.foreshadow.triggered"
    foreshadow_id: str = ""
    description: str = ""
    trigger_reason: str = ""
