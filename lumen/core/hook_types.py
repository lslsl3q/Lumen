"""HookBus 事件类型定义 — 所有 Payload 使用 Pydantic BaseModel"""

from typing import Any, Optional

from pydantic import BaseModel


class HookEvent(BaseModel):
    """所有 HookEvent 的基类"""
    event_name: str
    timestamp: float = 0.0


# ── Agent 生命周期 ──

class AgentBeforeActPayload(HookEvent):
    """Agent.act() 组件循环开始前触发"""
    event_name: str = "agent.before_act"
    agent_id: str = ""
    character_id: str = ""
    user_input: str = ""
    messages: list[dict[str, Any]] = []
    context: dict[str, Any] = {}  # 可变 — handler 可写入数据供后续使用


class AgentAfterActPayload(HookEvent):
    """Agent.act() 决策循环结束后触发"""
    event_name: str = "agent.after_act"
    agent_id: str = ""
    character_id: str = ""
    exit_reason: str = ""


# ── RPG 事件 ──

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


# RESERVED: T11 RPG 场景切换事件 — 场景进入时触发描述注入，待 RPG 面板 MVP 实现后启用
class RPGSceneEnterPayload(HookEvent):
    event_name: str = "rpg.scene.enter"
    scene_id: str = ""
    room_id: str = ""
    description: str = ""


# ── 内容创作事件 ──

class ContentCreatedPayload(HookEvent):
    """日记/梦境/RPG 叙事等内容创建后触发，用于图谱提取"""
    event_name: str = "content.created"
    content: str = ""
    content_type: str = ""  # "diary" / "dream" / "rpg"
    character_id: str = ""
    session_id: str = ""
    source_id: str = ""
    campaign_id: str = ""


# ── 伏笔 ──

class ForeshadowingPayload(HookEvent):
    event_name: str = "plot.foreshadow.triggered"
    foreshadow_id: str = ""
    description: str = ""
    trigger_reason: str = ""
