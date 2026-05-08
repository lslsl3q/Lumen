"""
T11 WritingContextComponent — 写作模式上下文注入

注入当前章节内容 + 世界观摘要（角色/地点/物品/世界设定）+ 写作指令。
续写/润色/扩写/精简四种模式各自有不同的提示词模板。
"""

import asyncio
import logging
import re

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)

MODE_PROMPTS = {
    "continue": (
        "你是一个专业的小说续写助手。基于当前章节内容和世界观设定，"
        "自然地延续剧情。注意：保持角色性格一致、文风统一、伏笔连贯。"
        "输出纯续写文字，不要加任何解释或标记。"
    ),
    "rewrite": (
        "你是一个专业的小说润色助手。根据用户的要求优化选中文字，"
        "保持原意和风格，提升表达质量。只输出润色后的文字，不加解释。"
    ),
    "expand": (
        "你是一个专业的小说扩写助手。根据用户指定的方向，"
        "在原有内容基础上展开描写——增加细节、对话、心理活动、环境描写等。"
        "保持角色性格和文风一致。只输出扩写后的文字。"
    ),
    "condense": (
        "你是一个专业的小说精简助手。根据用户要求精简文字，"
        "保留核心情节和关键信息，去除冗余描写。"
        "保持文风和节奏感。只输出精简后的文字。"
    ),
    "chat": (
        "你是一个专业的小说创作顾问。围绕用户的创作进行讨论——"
        "分析角色动机、讨论剧情走向、建议写作技巧、梳理伏笔线索。"
        "像一位经验丰富的编辑一样提供有价值、有深度的建议。"
    ),
}

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

        parts = []

        mode_prompt = MODE_PROMPTS.get(ai_mode, MODE_PROMPTS["chat"])
        parts.append(mode_prompt)

        parts.append(f"当前作品：《{book_name}》")
        parts.append(f"当前章节：「{chapter_title}」")

        if chapter_content:
            max_chars = 4000
            content_snippet = chapter_content[-max_chars:] if len(chapter_content) > max_chars else chapter_content
            if len(content_snippet) < len(chapter_content):
                parts.append(f"章节末尾内容（前文已省略 {len(chapter_content) - len(content_snippet)} 字）：\n---\n{content_snippet}\n---")
            else:
                parts.append(f"章节完整内容：\n---\n{content_snippet}\n---")

        if selected_text and ai_mode in ("rewrite", "expand", "condense"):
            action_verbs = {"rewrite": "润色", "expand": "扩写", "condense": "精简"}
            parts.append(f"需要{action_verbs[ai_mode]}的选中文字：\n---\n{selected_text}\n---")

        graph_summary = await self._get_graph_summary(context)
        if graph_summary:
            parts.append(graph_summary)

        return "\n\n".join(parts)

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
