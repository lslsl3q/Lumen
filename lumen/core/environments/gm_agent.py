"""T25 GM Agent 构建器 — 无状态临时 Agent，每次请求创建并销毁"""

import logging
from types import SimpleNamespace
from typing import AsyncGenerator

from lumen.agent import Agent
from lumen.components.gm_identity import GMIdentityComponent
from lumen.components.gm_world_context import GMWorldContextComponent
from lumen.components.gm_resolution import GMResolutionComponent
from lumen.components.tool import ToolComponent
from lumen.components.react_acting import ReActActingComponent
from lumen.services import world_state as ws

logger = logging.getLogger(__name__)


def _build_gm_agent(
    source_id: str,
    action_content: str,
    session_id: str = "",
) -> Agent:
    """构建临时 GM Agent（用完即弃，不持久化）

    Args:
        source_id: 玩家角色 ID（用于查询 WorldState）
        action_content: 玩家的自然语言行动
        session_id: 原始会话 ID（用于取消信号映射，格式: f"gm_{session_id}"）

    Returns:
        配置好的 GM Agent
    """
    agent = Agent("gm")

    # ContextComponents — 按 priority 排序拼 system prompt
    agent.add_component(GMIdentityComponent())       # priority=10, STATIC
    agent.add_component(GMWorldContextComponent())    # priority=30, DYNAMIC
    agent.add_component(GMResolutionComponent())      # priority=50, STATIC
    agent.add_component(ToolComponent())              # priority=90, STATIC

    # 临时 session（SimpleNamespace 跳过 ChatSession 的 DB 操作）
    gm_session_id = f"gm_{session_id}" if session_id else "gm_temp"
    temp_session = SimpleNamespace(
        session_id=gm_session_id,
        character_id="gm",
        messages=[
            {"role": "system", "content": ""},  # 占位，被 Agent.act() 的 static_prompt 替换
            {"role": "user", "content": action_content},
        ],
    )

    # ActingComponent — ReAct 循环
    agent.act_component = ReActActingComponent(
        session=temp_session,
        character_config={"name": "GM", "response_style": "balanced"},
        user_input=action_content,
        memory_debug=False,
    )

    return agent


async def gm_chat_stream(
    source_id: str,
    action_content: str,
    session_id: str = "",
) -> AsyncGenerator[dict, None]:
    """GM Agent 流式裁决 — 核心入口

    创建临时 GM Agent → ReAct 循环 → yield SSE 事件 → 销毁

    Args:
        source_id: 玩家角色 ID
        action_content: 玩家的自然语言行动
        session_id: 原始会话 ID（用于取消信号映射）

    Yields:
        SSEEvent dict（text/tool_start/tool_result/rpg_state/done）
    """
    # 记录玩家行动事件
    state = ws.get_agent_state(source_id)
    room_id = state.get("room_id", "") if state else ""
    if room_id:
        ws.record_event(room_id, source_id, "action", action_content[:100])

    # 构建上下文
    context = {
        "source_id": source_id,
        "action_content": action_content,
        "world_state": ws,
    }

    # 创建临时 GM Agent（传入 session_id 让取消信号能到达）
    gm_agent = _build_gm_agent(source_id, action_content, session_id=session_id)

    # ReAct 循环 → SSE 事件流
    async for event in gm_agent.act(context, short_term_history=[]):
        yield event

        # 检测完成：提取叙事并记录事件
        if event.get("type") == "done":
            from lumen.core.environments.narrative_parser import parse_narrative
            messages = gm_agent.act_component.session.messages
            assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
            if assistant_msgs:
                raw = assistant_msgs[-1].get("content", "")
                parsed = parse_narrative(raw)
                if room_id and parsed["narrative"]:
                    ws.record_event(room_id, "gm", "narrative", parsed["narrative"][:100])
