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


# ── 工具执行事件 ──

class ToolCallPayload(HookEvent):
    """工具执行前触发，handler 可修改 params 或抛 HookStopPropagation 阻断执行"""
    event_name: str = "tool.call"
    tool_name: str = ""
    tool_params: dict[str, Any] = {}
    tool_command: str = ""
    session_id: str = ""
    character_id: str = ""
    blocked: bool = False  # handler 设为 True 可阻断工具执行
    block_reason: str = ""


class ToolResultPayload(HookEvent):
    """工具执行后触发，handler 可修改 result"""
    event_name: str = "tool.result"
    tool_name: str = ""
    tool_params: dict[str, Any] = {}
    tool_command: str = ""
    result: dict[str, Any] = {}  # 可变 — handler 可修改结果
    duration_ms: float = 0.0
    session_id: str = ""
    character_id: str = ""


# ── 上下文构建事件 ──

class ContextBuildPayload(HookEvent):
    """所有 Component 构建完上下文后触发，handler 可追加/修改 prompt"""
    event_name: str = "context.build"
    static_prompt: str = ""
    dynamic_prompt: str = ""
    context: dict[str, Any] = {}  # 共享上下文
    agent_id: str = ""
    character_id: str = ""
    # handler 可写入 extra_static / extra_dynamic 追加内容
    extra_static: list[str] = []
    extra_dynamic: list[str] = []


# ── 输入事件 ──

class InputReceivedPayload(HookEvent):
    """用户输入到达时触发，handler 可转换输入或拦截"""
    event_name: str = "input.received"
    user_input: str = ""
    session_id: str = ""
    character_id: str = ""
    channel_id: str = ""
    transformed: bool = False  # handler 修改 user_input 后设为 True
    blocked: bool = False  # handler 设为 True 可阻断输入处理


# ── 子代理事件 ──

class SubagentCompletePayload(HookEvent):
    """子代理异步任务完成时触发"""
    event_name: str = "subagent.completed"
    run_id: str = ""
    output: str = ""
    tool_calls: int = 0
    iterations: int = 0


class SubagentFailedPayload(HookEvent):
    """子代理异步任务失败时触发"""
    event_name: str = "subagent.failed"
    run_id: str = ""
    error: str = ""
