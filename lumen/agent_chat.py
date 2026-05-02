"""
T24 Agent Chat 入口 — 用 Agent + Component 替代 query.py::chat_stream

流程：
1. 加载角色配置
2. 创建 Agent，注册所有标准 Component
3. 设置 ReActActingComponent 为决策组件
4. 调用 agent.act() → yield SSEEvent

与旧 chat_stream 的区别：
- system prompt 由 ContextComponent 按 priority 拼装，不调 builder.py
- 注入逻辑分散到各 Component，不在一个大函数里
- Actor 模式：Agent 持有组件列表，未来可切换 Environment
"""

import logging
from typing import AsyncGenerator

from lumen.agent import Agent
from lumen.components import (
    IdentityComponent,
    LoreComponent,
    MemoryComponent,
    SkillsComponent,
    ThinkingClusterComponent,
    ToolComponent,
)
from lumen.components.react_acting import ReActActingComponent, request_cancel, _clear_cancel
from lumen.core.session import ChatSession
from lumen.core.message_bus import get_message_bus
from lumen.prompt.character import load_character
from lumen.config import get_model

logger = logging.getLogger(__name__)


def _build_chat_agent(
    session: ChatSession,
    character_config: dict,
    user_input: str,
    memory_debug: bool = False,
) -> Agent:
    """构建 Chat 模式的 Agent（注册所有标准组件）"""
    agent = Agent("chat")

    # 注册到 MessageBus（T25 多 Agent 通信基础）
    bus = get_message_bus()
    if not bus.is_registered("chat"):
        mailbox = bus.register("chat")
        # Chat 模式下用 Agent 自己的 mailbox，RPG 模式由 Environment 管理
        agent.mailbox = mailbox

    # ContextComponents — 按 priority 排序后拼装 system prompt
    agent.add_component(IdentityComponent())    # priority=10
    agent.add_component(LoreComponent())        # priority=20
    agent.add_component(MemoryComponent())      # priority=30
    agent.add_component(SkillsComponent())      # priority=50
    agent.add_component(ThinkingClusterComponent())  # priority=60
    agent.add_component(ToolComponent())        # priority=90

    # ActingComponent — ReAct 决策循环
    agent.act_component = ReActActingComponent(
        session=session,
        character_config=character_config,
        user_input=user_input,
        memory_debug=memory_debug,
    )

    return agent


async def agent_chat_stream(
    user_input: str,
    session: ChatSession,
    memory_debug: bool = False,
    response_style: str = "balanced",
) -> AsyncGenerator[dict, None]:
    """Agent 驱动的流式对话（替代 query.py::chat_stream）

    Args:
        user_input: 用户输入
        session: 聊天会话
        memory_debug: 是否开启记忆调试
        response_style: 回复风格

    Yields:
        SSEEvent dict（text/done/tool_start/tool_result/status/memory_debug）
    """
    character_config = load_character(session.character_id)
    character_config["response_style"] = response_style

    agent = _build_chat_agent(session, character_config, user_input, memory_debug)

    context = {
        "character": character_config,
        "character_id": session.character_id,
        "session_id": session.session_id or "",
        "user_input": user_input,
        "messages": session.messages,
    }

    # short_term_history 由 ReActActingComponent 内部从 session.messages 获取
    async for event in agent.act(context, short_term_history=[]):
        yield event
