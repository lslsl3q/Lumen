"""
T11 WritingEnvironment — 写作模式环境

5 种 AI 模式路由：
- chat:      对话讨论（完整 Agent act()，有思想、有记忆）
- continue:  续写（Agent 感知当前章节 + 图谱 + 伏笔 → 生成续写）
- rewrite:   润色（Agent 理解选中文字 + 上下文 → 改写）
- expand:    扩写（Agent 在原有内容基础上展开描写）
- condense:  精简（Agent 去除冗余，保留核心）

全部走 Agent 管道（不是裸 LLM），Agent 有身份、有知识、有记忆。
"""

import logging
from typing import AsyncGenerator

from lumen.core.environments.base import BaseEnvironment
from lumen.types.agent_message import AgentMessage

logger = logging.getLogger(__name__)


def _build_writing_agent(
    book_id: str,
    chapter_id: str,
    ai_mode: str,
    chapter_title: str,
    chapter_content: str,
    book_name: str,
    selected_text: str = "",
    user_input: str = "",
) -> "Agent":
    """构建临时 WritingAgent（每次请求创建，用完即弃）

    Args:
        book_id: 作品 ID（用于 TriviumDB writing.tdb 隔离）
        chapter_id: 章节 ID
        ai_mode: chat/continue/rewrite/expand/condense
        chapter_title: 章节标题
        chapter_content: 章节内容
        book_name: 作品名
        selected_text: 选中的文字（润色/扩写/精简模式用）
        user_input: 用户输入

    Returns:
        配置好的 Writing Agent
    """
    from lumen.agent import Agent
    from lumen.components import (
        IdentityComponent,
        LoreComponent,
        MemoryComponent,
        SkillsComponent,
        ToolComponent,
    )
    from lumen.components.writing_context import WritingContextComponent
    from lumen.components.react_acting import ReActActingComponent

    agent = Agent(f"writing-{book_id}")

    # ContextComponents — 按 priority 排序拼写 system prompt
    agent.add_component(IdentityComponent())          # priority=10, STATIC
    agent.add_component(WritingContextComponent())     # priority=25, DYNAMIC
    agent.add_component(LoreComponent())              # priority=20→实际30, DYNAMIC
    agent.add_component(MemoryComponent())            # priority=30, DYNAMIC
    agent.add_component(SkillsComponent())            # priority=50, STATIC
    agent.add_component(ToolComponent())              # priority=90, STATIC

    # ActingComponent — ReAct 循环
    from types import SimpleNamespace
    temp_session = SimpleNamespace(
        session_id=f"writing_{book_id}_{chapter_id}",
        character_id="writing",
        messages=[
            {"role": "system", "content": ""},
            {"role": "user", "content": user_input or "请开始写作"},
        ],
    )

    agent.act_component = ReActActingComponent(
        session=temp_session,
        character_config={
            "name": f"写作助手 - {book_name}",
            "response_style": "balanced",
        },
        user_input=user_input,
        memory_debug=False,
        save_user_message=True,
    )

    return agent


async def writing_chat_stream(
    book_id: str,
    chapter_id: str,
    ai_mode: str,
    chapter_title: str = "",
    chapter_content: str = "",
    book_name: str = "",
    selected_text: str = "",
    user_input: str = "",
) -> AsyncGenerator[dict, None]:
    """Writing Agent 流式响应 — 核心入口

    创建临时 WritingAgent → ReAct 循环 → yield SSE 事件 → 销毁

    Args:
        book_id: 作品 ID
        chapter_id: 章节 ID
        ai_mode: chat/continue/rewrite/expand/condense
        chapter_title: 章节标题
        chapter_content: 章节内容
        book_name: 作品名
        selected_text: 选中的文本（润色/扩写/精简模式）
        user_input: 用户输入

    Yields:
        SSEEvent dict（text/tool_start/tool_result/done）
    """
    # 构建上下文
    context = {
        "book_id": book_id,
        "chapter_id": chapter_id,
        "ai_mode": ai_mode,
        "chapter_title": chapter_title,
        "chapter_content": chapter_content,
        "book_name": book_name,
        "selected_text": selected_text,
        "user_input": user_input,
        "character": {
            "name": f"写作助手 - {book_name}",
            "response_style": "balanced",
            "knowledge_enabled": True,
        },
        "character_id": "writing",
    }

    # 创建临时 WritingAgent
    agent = _build_writing_agent(
        book_id=book_id,
        chapter_id=chapter_id,
        ai_mode=ai_mode,
        chapter_title=chapter_title,
        chapter_content=chapter_content,
        book_name=book_name,
        selected_text=selected_text,
        user_input=user_input,
    )

    # ReAct 循环 → SSE 事件流
    async for event in agent.act(context, short_term_history=[]):
        yield event


class WritingEnvironment(BaseEnvironment):
    """写作环境 — 续写/润色/扩写/精简/对话，全部走 Agent 管道"""

    def __init__(self, message_bus):
        super().__init__(message_bus)

    async def process_message(
        self,
        source_id: str,
        target_id: str | None,
        msg: AgentMessage,
    ) -> AsyncGenerator[dict, None]:
        """处理写作消息，yield SSE 事件

        msg.metadata 必须包含:
            ai_mode: chat/continue/rewrite/expand/condense
            book_id: 作品 ID
            chapter_id: 章节 ID
        """
        content = msg.get("content", "")
        metadata = msg.get("metadata", {})

        ai_mode = metadata.get("ai_mode", "chat")
        book_id = metadata.get("book_id", "")
        chapter_id = metadata.get("chapter_id", "")
        chapter_title = metadata.get("chapter_title", "")
        chapter_content = metadata.get("chapter_content", "")
        book_name = metadata.get("book_name", "")
        selected_text = metadata.get("selected_text", "")

        if not book_id:
            yield {"type": "text", "content": "[错误] 未指定作品"}
            yield {"type": "done", "exit_reason": "missing_book_id"}
            return

        async for event in writing_chat_stream(
            book_id=book_id,
            chapter_id=chapter_id,
            ai_mode=ai_mode,
            chapter_title=chapter_title,
            chapter_content=chapter_content,
            book_name=book_name,
            selected_text=selected_text,
            user_input=content,
        ):
            yield event
