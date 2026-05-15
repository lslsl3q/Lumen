"""
T11 WritingContextComponent — 写作模式上下文注入

通过 ContextQueryService 按需查询章节数据和世界观设定，
而非将全部数据硬塞给模板。模板通过 query proxy 主动查询。
"""

import asyncio
import logging

from lumen.components.base import ContextComponent, PromptZone
from lumen.prompt.template_engine import render_message, TemplateError, build_context
from lumen.services.writing.context_query import ContextQueryService, _TemplateQueryProxy

logger = logging.getLogger(__name__)


class WritingContextComponent(ContextComponent):
    """写作上下文组件：创建 ContextQueryService 并传递给模板"""

    name = "writing_context"
    priority = 25
    zone = PromptZone.DYNAMIC

    async def pre_act(self, context: dict) -> str:
        ai_mode = context.get("ai_mode", "chat")
        chapter_title = context.get("chapter_title", "未命名章节")
        chapter_content = context.get("chapter_content", "")
        selected_text = context.get("selected_text", "")
        book_name = context.get("book_name", "")
        book_id = context.get("book_id", "")
        chapter_id = context.get("chapter_id", "")
        beat_text = context.get("beat_text") or context.get("user_input", "")
        beat_context = context.get("beat_context", "")
        max_words = context.get("max_words")

        # Content truncation
        content_truncated = False
        if chapter_content and len(chapter_content) > 4000:
            chapter_content = chapter_content[-4000:]
            content_truncated = True

        # 创建查询服务，预加载数据到内存
        svc = ContextQueryService(book_id, chapter_id)
        if book_id:
            await asyncio.to_thread(svc.preload)
        query_proxy = _TemplateQueryProxy(svc)

        template_context = build_context(
            character_id=context.get("character_id", "default"),
            book_name=book_name,
            chapter_title=chapter_title,
            chapter_content=chapter_content,
            content_truncated=content_truncated,
            selected_text=selected_text,
            beat_text=beat_text,
            beat_context=beat_context,
            max_words=max_words,
            query=query_proxy,
        )

        try:
            system_part, user_part = render_message(f"writing/{ai_mode}", template_context)
        except TemplateError:
            logger.error("Template render failed for writing mode '%s'", ai_mode, exc_info=True)
            return ""

        if user_part:
            context["_writing_user_section"] = user_part

        return system_part
