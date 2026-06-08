"""
T11 WritingEnvironment — 写作模式环境

两种 AI 管道：

1. 直接管道（direct_writing_stream）— 模板渲染 + 直调 LLM
   用于：continue / expand / rewrite / condense / beat_generate
   无 Agent、无 ReAct、无 persona、无记忆。纯文本变换。

2. Agent 管道（writing_chat_stream）— 完整 Agent act()
   用于：chat（写作协同编辑、多轮对话、diff 式修改）
   有身份、有知识、有记忆、有工具。
"""

import asyncio
import logging
from typing import AsyncGenerator

from lumen.core.environments.base import BaseEnvironment
from lumen.types.agent_message import AgentMessage

logger = logging.getLogger(__name__)


# ── 直接管道：模板渲染 + LLM 流式调用 ──


async def direct_writing_stream(
    ai_mode: str,
    book_id: str,
    chapter_id: str,
    chapter_title: str = "",
    chapter_content: str = "",
    book_name: str = "",
    selected_text: str = "",
    text_before_selection: str = "",
    text_after_selection: str = "",
    beat_text: str = "",
    beat_context: str = "",
    max_words: int | None = None,
    model_id: str = "",
    context_selection: dict | None = None,
    scene_id: str = "",
    instructions: str = "",
    **extra_context,
) -> AsyncGenerator[dict, None]:
    """直接模板渲染 + LLM 调用，不经过 Agent 管道

    用于 continue / expand / rewrite / condense / beat_generate。
    无 persona、无记忆、无 ReAct。

    context_selection: 前端传入的结构化上下文选择，包含：
      fullNovelText, fullOutline, acts, chapters, scenes,
      snippets, codexEntries, codexTypes

    scene_id: 当前编辑的 scene ID，用于 Plot 上下文精准匹配
    """
    from lumen.prompt.template_engine import render_message, build_context, TemplateError
    from lumen.services.writing.context_query import ContextQueryService, _TemplateQueryProxy
    from lumen.services.llm import chat
    from lumen.config import DEFAULT_MODEL

    model = model_id or DEFAULT_MODEL

    # Load project metadata for tense/POV/language/narrative character
    from lumen.services.storage.writing import get_project
    project = await asyncio.to_thread(get_project, book_id)
    project_meta = (project or {}).get("metadata", {}) or {}

    # Resolve narrative character from Codex
    narrative_character = ""
    nc_id = project_meta.get("narrative_character_id", "")
    if nc_id and book_id:
        from lumen.services.storage.writing import list_codex
        codex_entries = await asyncio.to_thread(list_codex, book_id)
        char = next((e for e in (codex_entries or []) if e.get("id") == nc_id), None)
        if char:
            from lumen.services.writing.context_query import _format_entity
            narrative_character = _format_entity(
                char.get("name", ""),
                char.get("content", {}),
            )

    # Content truncation
    content_truncated = False
    if chapter_content and len(chapter_content) > 4000:
        chapter_content = chapter_content[-4000:]
        content_truncated = True

    # 构建上下文查询服务 — 仅在用户选择了上下文时加载
    svc = ContextQueryService(book_id, chapter_id, scene_id=scene_id)
    plot_outline = ""
    plot_for_scene = ""
    if book_id and context_selection:
        await asyncio.to_thread(svc.preload)
        await asyncio.to_thread(svc.set_context_selection, context_selection)
        # Plot 数据仅在 context_selection 包含 Plot 相关项时才加载
        plot_outline = svc.plot_outline()
        plot_for_scene = svc.plot_for_current_scene()
    query_proxy = _TemplateQueryProxy(svc)

    template_context = build_context(
        character_id="writing",
        book_name=book_name,
        chapter_title=chapter_title,
        chapter_content=chapter_content,
        content_truncated=content_truncated,
        selected_text=selected_text,
        selected_word_count=len(selected_text) if selected_text else 0,
        text_before_selection=text_before_selection,
        text_after_selection=text_after_selection,
        beat_text=beat_text,
        beat_context=beat_context,
        max_words=max_words,
        instructions=instructions,
        query=query_proxy,
        tense=project_meta.get("tense", "past"),
        pov=project_meta.get("pov", "3rd"),
        language=project_meta.get("language", "zh-CN"),
        narrative_character=narrative_character,
        plot_outline=plot_outline,
        plot_for_scene=plot_for_scene,
        **extra_context,
    )

    try:
        from lumen.prompt.template_engine import render_messages
        messages = render_messages(f"writing/{ai_mode}", template_context)
    except Exception as e:
        yield {"type": "error", "message": f"模板错误: {e}"}
        return

    if not messages:
        yield {"type": "error", "message": "模板渲染结果为空"}
        return

    # 直调 LLM，流式返回
    try:
        response = await chat(
            messages=messages,
            model=model,
            stream=True,
        )

        async for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield {"type": "text", "content": delta.content}

        yield {"type": "done", "exit_reason": "completed"}

    except Exception as e:
        logger.error("[Writing Direct] LLM 调用失败: %s", e)
        yield {"type": "error", "message": str(e)}


# ── Agent 管道：完整 Agent act() ──


def _build_writing_agent(
    book_id: str,
    chapter_id: str,
    ai_mode: str,
    chapter_title: str,
    chapter_content: str,
    book_name: str,
    selected_text: str = "",
    user_input: str = "",
    extra_context: dict | None = None,
) -> "Agent":
    """构建临时 WritingAgent（每次请求创建，用完即弃）

    仅用于 chat 模式。
    """
    session_messages = [
        {"role": "system", "content": ""},
        {"role": "user", "content": user_input or "请开始写作"},
    ]
    if extra_context:
        session_messages[1]["content"] = extra_context.get("beat_text") or user_input or "请开始写作"

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

    components = [
        IdentityComponent(),
        WritingContextComponent(),
        LoreComponent(),
        MemoryComponent(),
        SkillsComponent(),
        ToolComponent(),
    ]
    from lumen.core.hook_bus import HookBus
    hook_bus = HookBus.get()
    for comp in components:
        agent.add_component(comp)
        comp.register(hook_bus)

    from types import SimpleNamespace
    temp_session = SimpleNamespace(
        session_id=f"writing_{book_id}_{chapter_id}",
        character_id="writing",
        messages=session_messages,
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
    extra_context: dict | None = None,
) -> AsyncGenerator[dict, None]:
    """Writing Agent 流式响应 — 仅用于 chat 模式

    创建临时 WritingAgent → ReAct 循环 → yield SSE 事件 → 销毁
    """
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
    if extra_context:
        context.update(extra_context)

    # 确保扩展已加载
    from lumen.core.agent_chat import _ensure_hookbus
    _ensure_hookbus()

    agent = _build_writing_agent(
        book_id=book_id,
        chapter_id=chapter_id,
        ai_mode=ai_mode,
        chapter_title=chapter_title,
        chapter_content=chapter_content,
        book_name=book_name,
        selected_text=selected_text,
        user_input=user_input,
        extra_context=extra_context,
    )

    async for event in agent.act(context, short_term_history=[]):
        yield event


class WritingEnvironment(BaseEnvironment):
    """写作环境 — chat 走 Agent 管道，其余走直接管道"""

    def __init__(self, message_bus):
        super().__init__(message_bus)

    async def process_message(
        self,
        source_id: str,
        target_id: str | None,
        msg: AgentMessage,
    ) -> AsyncGenerator[dict, None]:
        content = msg.get("content", "")
        metadata = msg.get("metadata", {})

        ai_mode = metadata.get("ai_mode", "chat")
        book_id = metadata.get("book_id", "")
        chapter_id = metadata.get("chapter_id", "")

        if not book_id:
            yield {"type": "text", "content": "[错误] 未指定作品"}
            yield {"type": "done", "exit_reason": "missing_book_id"}
            return

        if ai_mode == "chat":
            async for event in writing_chat_stream(
                book_id=book_id,
                chapter_id=chapter_id,
                ai_mode=ai_mode,
                chapter_title=metadata.get("chapter_title", ""),
                chapter_content=metadata.get("chapter_content", ""),
                book_name=metadata.get("book_name", ""),
                selected_text=metadata.get("selected_text", ""),
                user_input=content,
            ):
                yield event
        else:
            async for event in direct_writing_stream(
                ai_mode=ai_mode,
                book_id=book_id,
                chapter_id=chapter_id,
                chapter_title=metadata.get("chapter_title", ""),
                chapter_content=metadata.get("chapter_content", ""),
                book_name=metadata.get("book_name", ""),
                selected_text=metadata.get("selected_text", ""),
                text_before_selection=metadata.get("text_before_selection", ""),
                text_after_selection=metadata.get("text_after_selection", ""),
                beat_text=metadata.get("beat_text", ""),
                beat_context=metadata.get("beat_context", ""),
                max_words=metadata.get("max_words"),
                model_id=metadata.get("model_id", ""),
                context_selection=metadata.get("context_selection"),
                scene_id=metadata.get("scene_id", ""),
                instructions=metadata.get("instructions", ""),
            ):
                yield event
