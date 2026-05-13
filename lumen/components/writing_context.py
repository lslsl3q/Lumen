"""
T11 WritingContextComponent — 写作模式上下文注入

注入当前章节内容 + 世界观摘要（角色/地点/物品/世界设定）+ 写作指令。
提示词模板通过 Jinja2 引擎从 lumen/data/templates/writing/ 加载。
"""

import asyncio
import logging
import re

from lumen.components.base import ContextComponent, PromptZone
from lumen.prompt.template_engine import render, render_message, TemplateError, build_context

logger = logging.getLogger(__name__)

CATEGORY_LABELS = {
    "character": "角色",
    "location": "地点",
    "world": "世界设定",
    "object": "物品",
    "plot": "剧情",
    "rules": "规则",
    "custom": "自定义",
}

FIELD_LABELS = {
    "gender": "性别", "age": "年龄", "appearance": "外貌", "personality": "性格",
    "background": "背景", "abilities": "能力", "text": "备注",
    "environment": "环境", "features": "特色", "connections": "关联",
    "rules": "规则", "geography": "地理", "history": "历史",
    "properties": "属性", "owner": "持有者",
}

SELECT_KEYS = {"role", "rarity", "item_type", "loc_type", "sub_type"}

MAX_ENTITIES_PER_CATEGORY = 10
MAX_DESCRIPTION_LENGTH = 200

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text).strip()


class WritingContextComponent(ContextComponent):
    """写作上下文组件：注入章节 + 世界观摘要 + 写作指令"""

    name = "writing_context"
    priority = 25
    zone = PromptZone.DYNAMIC

    def __init__(self):
        self._cached_book_id: str | None = None
        self._cached_summary: str = ""

    async def pre_act(self, context: dict) -> str:
        ai_mode = context.get("ai_mode", "chat")
        chapter_title = context.get("chapter_title", "未命名章节")
        chapter_content = context.get("chapter_content", "")
        selected_text = context.get("selected_text", "")
        book_name = context.get("book_name", "")

        # Content truncation — business logic stays in code
        content_truncated = False
        if chapter_content and len(chapter_content) > 4000:
            chapter_content = chapter_content[-4000:]
            content_truncated = True

        codex_context = await self._get_graph_summary(context)

        template_context = build_context(
            character_id=context.get("character_id", "default"),
            book_name=book_name,
            chapter_title=chapter_title,
            chapter_content=chapter_content,
            content_truncated=content_truncated,
            selected_text=selected_text,
            codex_context=codex_context,
        )

        try:
            system_part, user_part = render_message(f"writing/{ai_mode}", template_context)
        except TemplateError:
            logger.error("Template render failed for writing mode '%s'", ai_mode, exc_info=True)
            return ""

        if user_part:
            context["_writing_user_section"] = user_part

        return system_part

    async def _get_graph_summary(self, context: dict) -> str:
        """从 SQLite writing_settings 获取世界观摘要

        查询当前作品的全部设定，按类别分组格式化为文本摘要。
        book_id 即 project_id（通信协议用 book_id，数据库用 project_id）。
        结果按 book_id 缓存，同一 book_id 的 ReAct 循环内不重复查询。
        """
        book_id = context.get("book_id", "")
        if not book_id:
            return ""

        if book_id == self._cached_book_id:
            return self._cached_summary

        try:
            from lumen.services.storage.writing import list_settings
            settings = await asyncio.to_thread(list_settings, book_id)
        except Exception:
            logger.warning("Failed to load writing settings", exc_info=True)
            return ""

        settings = [s for s in settings if s.get("enabled", 1)]

        if not settings:
            self._cached_book_id = book_id
            self._cached_summary = ""
            return ""

        grouped: dict[str, list[dict]] = {}
        for s in settings:
            cat = s.get("category", "custom")
            if cat not in grouped:
                grouped[cat] = []
            grouped[cat].append(s)

        sections = []
        for cat, label in CATEGORY_LABELS.items():
            items = grouped.pop(cat, [])
            if not items:
                continue
            entries = [self._format_entity(i.get("name", "未命名"), i.get("content", {})) for i in items[:MAX_ENTITIES_PER_CATEGORY]]
            sections.append(f"【{label}】（{len(items)} 个）\n" + "\n".join(entries))

        for cat, items in grouped.items():
            entries = [self._format_entity(i.get("name", "未命名"), i.get("content", {})) for i in items[:MAX_ENTITIES_PER_CATEGORY]]
            sections.append(f"【{cat}】（{len(items)} 个）\n" + "\n".join(entries))

        result = "世界观设定摘要：\n" + "\n".join(sections) if sections else ""
        self._cached_book_id = book_id
        self._cached_summary = result
        return result

    def _format_entity(self, name: str, content: dict) -> str:
        """将一个设定实体格式化为可读文本"""
        if isinstance(content, str):
            content = {}

        parts = [f"· {name}"]

        role_map = {"protagonist": "主角", "antagonist": "反派", "supporting": "配角", "minor": "龙套"}
        if "role" in content and content["role"] in role_map:
            parts[0] += f"（{role_map[content['role']]}）"

        desc_fields = []
        for key, val in content.items():
            if not val or not isinstance(val, str):
                continue
            if key in SELECT_KEYS:
                continue
            text = _strip_html(val.strip())
            if not text:
                continue
            if len(text) > MAX_DESCRIPTION_LENGTH:
                text = text[:MAX_DESCRIPTION_LENGTH] + "…"
            label = FIELD_LABELS.get(key, key)
            desc_fields.append(f"  - {label}: {text}")

        if desc_fields:
            parts.append("\n".join(desc_fields))

        return "\n".join(parts)
