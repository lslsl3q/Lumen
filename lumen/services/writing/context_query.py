"""
写作模式 Context Query Engine — 按需查询章节数据和世界观设定

模板不应被动接受全部数据，而应按维度主动查询。
本服务提供 Jinja2 模板可调用的查询方法，通过 _TemplateQueryProxy 传入模板上下文。

依赖方向：只 import services/storage/writing.py，不 import components/ 或 core/。
"""

import json
import re
import logging
from typing import Any

from lumen.services.storage.writing import (
    list_chapters, list_codex,
    list_acts, list_snippets, list_scenes,
)

logger = logging.getLogger(__name__)

# ── 从 writing_context.py 迁移的常量 ──

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

# SELECT_KEYS 是要跳过的字段（下拉选择值，不是描述性文本）
SELECT_KEYS = {"role", "rarity", "item_type", "loc_type", "sub_type"}

MAX_ENTITIES_PER_CATEGORY = 10
MAX_DESCRIPTION_LENGTH = 200
_SUMMARY_LENGTH = 500

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return _HTML_TAG_RE.sub("", text).strip()


def _pm_json_text(content_str: str) -> str:
    """Extract plain text from ProseMirror JSON content string."""
    try:
        doc = json.loads(content_str)
    except (json.JSONDecodeError, TypeError):
        return content_str if isinstance(content_str, str) else ""
    texts = []
    def walk(node):
        if node.get("type") == "text" and node.get("text"):
            texts.append(node["text"])
        for child in node.get("content", []):
            walk(child)
    walk(doc)
    return "\n".join(texts)


def _format_entity(name: str, content: dict) -> str:
    """将一个设定实体格式化为可读文本（从 writing_context.py 迁移）"""
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


def _format_settings_grouped(settings: list[dict]) -> str:
    """按类别分组格式化设定列表（NovelCrafter Codex 排序：按类别 → 按名称）"""
    grouped: dict[str, list[dict]] = {}
    for s in settings:
        cat = s.get("category", "custom")
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(s)

    sections = []
    # 先按预定义顺序输出
    for cat, label in CATEGORY_LABELS.items():
        items = grouped.pop(cat, [])
        if not items:
            continue
        entries = [
            _format_entity(i.get("name", "未命名"), i.get("content", {}))
            for i in items[:MAX_ENTITIES_PER_CATEGORY]
        ]
        sections.append(f"【{label}】（{len(items)} 个）\n" + "\n".join(entries))

    # 剩余自定义类别
    for cat, items in grouped.items():
        entries = [
            _format_entity(i.get("name", "未命名"), i.get("content", {}))
            for i in items[:MAX_ENTITIES_PER_CATEGORY]
        ]
        sections.append(f"【{cat}】（{len(items)} 个）\n" + "\n".join(entries))

    return "世界观设定摘要：\n" + "\n".join(sections) if sections else ""


def _chapter_summary(ch: dict) -> str:
    """Format chapter summary from its scenes' text (first 500 chars)."""
    from lumen.services.storage.writing import list_scenes
    scenes = list_scenes(ch.get("id", ""))
    combined = " ".join(_pm_json_text(s.get("content", "{}")) for s in scenes)
    title = ch.get("title", "未命名章节")
    order = ch.get("sort_order", "?")
    summary = combined[:_SUMMARY_LENGTH] + ("..." if len(combined) > _SUMMARY_LENGTH else "")
    return f"第{order + 1}章 {title}\n{summary}"


def _chapter_full(ch: dict) -> str:
    """Format full chapter text from all scenes."""
    from lumen.services.storage.writing import list_scenes
    title = ch.get("title", "未命名章节")
    order = ch.get("sort_order", "?")
    scenes = list_scenes(ch.get("id", ""))
    combined = "\n---\n".join(_pm_json_text(s.get("content", "{}")) for s in scenes)
    return f"第{order + 1}章 {title}\n---\n{combined}\n---"


def _chapter_title(ch: dict) -> str:
    """格式化单个章节的标题行"""
    title = ch.get("title", "未命名章节")
    wc = ch.get("word_count", 0)
    return f"{title}（{wc}字）"


class ContextQueryService:
    """per-request 查询服务，预加载数据到内存缓存

    由 WritingContextComponent 创建，在 asyncio.to_thread 中调用 preload()，
    随后由 _TemplateQueryProxy 在 Jinja2 模板渲染时调用各查询方法。
    所有查询方法只读缓存，不做 DB 访问。
    """

    def __init__(self, book_id: str, chapter_id: str, scene_id: str = ""):
        self._book_id = book_id
        self._chapter_id = chapter_id
        self._scene_id = scene_id
        self._all_chapters: list[dict[str, Any]] | None = None
        self._all_settings: list[dict[str, Any]] | None = None
        self._current_index: int = 0
        self._context_selection: dict[str, Any] | None = None
        self._resolved_context: str = ""
        # Plot 数据缓存
        self._plot_outline: dict[str, Any] | None = None
        self._plot_for_scene: dict[str, Any] | None = None

    def preload(self):
        """预加载章节数据和设定数据到内存"""
        if not self._book_id:
            self._all_chapters = []
            self._all_settings = []
            return

        self._all_chapters = list_chapters(self._book_id) or []
        self._all_settings = [
            s for s in (list_codex(self._book_id) or [])
            if s.get("enabled", 1)
        ]

        # 找到当前章节在列表中的索引
        self._current_index = next(
            (i for i, ch in enumerate(self._all_chapters) if ch.get("id") == self._chapter_id),
            len(self._all_chapters),
        )

        # 预加载 Plot 数据
        self._preload_plot_data()

    def _preload_plot_data(self):
        """预加载 Plot 层级数据到内存"""
        if not self._book_id:
            return
        from lumen.services.storage.writing import (
            get_plot_outline_for_project, get_plot_for_scene, list_scenes,
        )
        self._plot_outline = get_plot_outline_for_project(self._book_id)

        scene_id: str = self._scene_id
        if not scene_id and self._chapter_id:
            scenes = list_scenes(self._chapter_id)
            if scenes:
                scene_id = scenes[-1]["id"]
        if scene_id:
            self._plot_for_scene = get_plot_for_scene(scene_id)

    # ── Plot 查询 ──

    def plot_for_current_scene(self) -> dict[str, Any] | None:
        """返回当前 scene 关联的 Plot 上下文数据"""
        return self._plot_for_scene

    def plot_outline(self) -> dict[str, Any] | None:
        """返回项目 Plot 全景概要"""
        return self._plot_outline

    # ── Context Selection (NC-aligned) ──

    def set_context_selection(self, selection: dict[str, Any]):
        """接收前端传入的结构化上下文选择，预解析为模板可用的文本块。"""
        self._context_selection = selection
        self._resolved_context = self._resolve_selection(selection)

    def _resolve_selection(self, sel: dict[str, Any]) -> str:
        """将前端 context_selection 聚合为一段注入文本。"""
        parts: list[str] = []

        # 全部手稿
        if sel.get("fullNovelText") and self._all_chapters:
            texts = [_chapter_full(ch) for ch in self._all_chapters]
            if texts:
                parts.append("全部手稿正文：\n" + "\n\n".join(texts))

        # 全部大纲
        if sel.get("fullOutline") and self._all_chapters:
            outlines = [_chapter_title(ch) for ch in self._all_chapters]
            if outlines:
                parts.append("全部大纲：\n" + "\n".join(outlines))

        # 选中的卷
        act_ids = sel.get("acts", [])
        if act_ids and self._all_chapters:
            all_acts = list_acts(self._book_id) if self._book_id else []
            for aid in act_ids:
                act = next((a for a in all_acts if a.get("id") == aid), None)
                if not act:
                    continue
                title = act.get("title", f"Act {(act.get('sort_order', 0) + 1)}")
                act_chs = [ch for ch in self._all_chapters if ch.get("act_id") == aid]
                ch_summaries = [_chapter_summary(ch) for ch in act_chs]
                if ch_summaries:
                    parts.append(f"卷「{title}」：\n" + "\n\n".join(ch_summaries))

        # 选中的章节
        chapter_ids = sel.get("chapters", [])
        if chapter_ids and self._all_chapters:
            for ch in self._all_chapters:
                if ch.get("id") in chapter_ids:
                    parts.append(_chapter_summary(ch))

        # 选中的场景
        scene_ids = sel.get("scenes", [])
        if scene_ids and self._all_chapters:
            for ch in self._all_chapters:
                scenes = list_scenes(ch.get("id", ""))
                for sc in scenes:
                    if sc.get("id") in scene_ids:
                        text = _pm_json_text(sc.get("content", "{}"))
                        subtitle = sc.get("subtitle", "") or sc.get("summary", "")
                        header = f"场景: {subtitle}" if subtitle else "场景"
                        if text:
                            parts.append(f"{header}\n{text[:_SUMMARY_LENGTH]}")

        # 选中的片段
        snippet_ids = sel.get("snippets", [])
        if snippet_ids and self._book_id:
            all_snippets = list_snippets(self._book_id)
            for sn in all_snippets:
                if sn.get("id") in snippet_ids:
                    name = sn.get("name", "未命名片段")
                    content = sn.get("content", "")
                    if content:
                        parts.append(f"片段「{name}」：\n{content[:_SUMMARY_LENGTH]}")

        # 选中的法典条目（individual）
        codex_entry_ids = sel.get("codexEntries", [])
        if codex_entry_ids and self._all_settings:
            entries = [s for s in self._all_settings if s.get("id") in codex_entry_ids]
            if entries:
                parts.append(_format_settings_grouped(entries))

        # 按类型选择的法典条目
        codex_types = sel.get("codexTypes", [])
        if codex_types and self._all_settings:
            entries = [s for s in self._all_settings if s.get("category") in codex_types or s.get("type") in codex_types]
            if entries:
                parts.append(_format_settings_grouped(entries))

        # 按标签选择的法典条目
        codex_tags = sel.get("codexTags", [])
        if codex_tags and self._all_settings:
            entries = [s for s in self._all_settings if set(s.get("tags", []) or []) & set(codex_tags)]
            if entries:
                parts.append(_format_settings_grouped(entries))

        # 按详情选择的法典条目（custom_fields key 维度）
        codex_details = sel.get("codexDetails", [])
        if codex_details and self._all_settings:
            entries = [s for s in self._all_settings
                       if isinstance(s.get("custom_fields"), dict)
                       and set(s["custom_fields"].keys()) & set(codex_details)]
            if entries:
                parts.append(_format_settings_grouped(entries))

        # 按分类选择的法典条目
        codex_categories = sel.get("codexCategories", [])
        if codex_categories and self._all_settings:
            entries = [s for s in self._all_settings if s.get("category") in codex_categories]
            if entries:
                parts.append(_format_settings_grouped(entries))

        # Plot context — 按选中项过滤注入
        if sel.get("plotEnabled") and self._plot_outline:
            arc_ids = sel.get("plotArcs", [])
            line_ids = sel.get("plotLines", [])
            parts.append(_format_plot_selection(self._plot_outline, self._plot_for_scene, arc_ids, line_ids))

        return "\n\n".join(parts)

    def resolved_context(self) -> str:
        """模板调用：返回前端选择的上下文文本。空字符串表示无选择。"""
        return self._resolved_context

    # ── 章节查询 ──

    def chapters_before(self, format: str = "summary", limit: int = 0, volume: str | None = None) -> str:
        """当前章节之前的章节（story so far）

        Args:
            format: "summary"(前500字) | "full"(完整) | "titles"(仅标题)
            limit: 最多返回 N 个，0=全部
            volume: 按分卷名过滤
        """
        if not self._all_chapters:
            return ""
        chapters = self._all_chapters[:self._current_index]
        if volume:
            chapters = [ch for ch in chapters if ch.get("volume") == volume]
        if limit > 0:
            chapters = chapters[-limit:]  # 取最近的 N 个
        return self._format_chapters(chapters, format)

    def chapters_after(self, format: str = "summary", limit: int = 0, volume: str | None = None) -> str:
        """当前章节之后的章节（story to come）"""
        if not self._all_chapters:
            return ""
        chapters = self._all_chapters[self._current_index + 1:]
        if volume:
            chapters = [ch for ch in chapters if ch.get("volume") == volume]
        if limit > 0:
            chapters = chapters[:limit]
        return self._format_chapters(chapters, format)

    def last_n_chapters(self, n: int = 3, format: str = "summary") -> str:
        """最近 N 个章节（chapters_before 的便捷方法）"""
        return self.chapters_before(format=format, limit=n)

    def _format_chapters(self, chapters: list[dict], format: str) -> str:
        formatters = {
            "summary": _chapter_summary,
            "full": _chapter_full,
            "titles": _chapter_title,
        }
        fn = formatters.get(format, _chapter_summary)
        return "\n\n".join(fn(ch) for ch in chapters)

    # ── 设定查询（Codex 等价）──

    def settings(self, categories: list[str] | None = None) -> str:
        """获取格式化设定，可按类别过滤"""
        if not self._all_settings:
            return ""
        if categories:
            filtered = [s for s in self._all_settings if s.get("category") in categories]
        else:
            filtered = self._all_settings
        return _format_settings_grouped(filtered)

    def setting_by_name(self, name: str) -> str:
        """按名称查找单个设定，返回格式化文本"""
        if not self._all_settings:
            return ""
        s = next((s for s in self._all_settings if s.get("name") == name), None)
        if not s:
            return ""
        return _format_entity(s.get("name", ""), s.get("content", {}))

    def setting_has(self, name: str) -> bool:
        """检查设定是否存在（用于 {% if %} 条件）"""
        if not self._all_settings:
            return False
        return any(s.get("name") == name for s in self._all_settings)

    def related_settings(self, setting_name: str) -> str:
        """获取子设定（parent_id 匹配）"""
        if not self._all_settings:
            return ""
        parent = next((s for s in self._all_settings if s.get("name") == setting_name), None)
        if not parent:
            return ""
        pid = parent.get("id")
        children = [s for s in self._all_settings if s.get("parent_id") == pid]
        if not children:
            return ""
        return _format_settings_grouped(children)

    def detect_mentions(self, text: str) -> str:
        """扫描文本中的设定名称 mention，返回格式化条目

        MVP 用简单子串匹配，后续可升级为语义匹配。
        """
        if not self._all_settings or not text:
            return ""
        mentioned = []
        for s in self._all_settings:
            name = s.get("name", "")
            if name and name in text:
                mentioned.append(s)
                continue
            # 检查别名（content JSON 中可能有 aliases 字段）
            content = s.get("content", {})
            if isinstance(content, dict):
                aliases = content.get("aliases", [])
                if isinstance(aliases, list) and any(a and a in text for a in aliases):
                    mentioned.append(s)
        if not mentioned:
            return ""
        return _format_settings_grouped(mentioned)

    def codex_injection(self, text: str = "") -> str:
        """完整 Codex 注入算法（7 步）

        tracking_mode 存在 content._tracking 字段，4 档控制：
        - "always":       始终注入，排在最前
        - "detected":     mention 时自动加入（默认）
        - "anti_spoiler": mention 时反而排除（防剧透）
        - "never":        永不注入（enabled=0）
        """
        if not self._all_settings:
            return ""

        def _tracking(s: dict[str, Any]) -> str:
            content = s.get("content", {})
            if not isinstance(content, dict):
                return "detected"
            return content.get("_tracking", "detected")

        always_entries: list[dict] = []
        mentioned_entries: list[dict] = []
        spoiler_ids: set[str] = set()
        always_ids: set[str] = set()

        # Step 1: 分类条目（always / anti_spoiler / detected）
        for s in self._all_settings:
            mode = _tracking(s)
            sid = s.get("id", "")
            if mode == "always":
                always_entries.append(s)
                always_ids.add(sid)
            elif mode == "anti_spoiler":
                spoiler_ids.add(sid)

        # Step 2: mention 检测（在 text 中扫描名称和别名）
        mentioned_ids: set[str] = set()
        if text:
            for s in self._all_settings:
                sid = s.get("id", "")
                if sid in mentioned_ids or sid in always_ids or sid in spoiler_ids:
                    continue
                name = s.get("name", "")
                if name and name in text:
                    mentioned_ids.add(sid)
                    mentioned_entries.append(s)
                    continue
                content = s.get("content", {})
                if isinstance(content, dict):
                    aliases = content.get("aliases", [])
                    if isinstance(aliases, list) and any(a and a in text for a in aliases):
                        mentioned_ids.add(sid)
                        mentioned_entries.append(s)

        # Step 3: 合并 always + mentioned
        active_ids = always_ids | mentioned_ids
        active_list = always_entries + mentioned_entries

        # Step 4: 关联子条目（parent_id 匹配已激活的条目）
        for s in self._all_settings:
            pid = s.get("parent_id", "")
            sid = s.get("id", "")
            if pid in active_ids and sid not in active_ids and sid not in spoiler_ids:
                active_ids.add(sid)
                active_list.append(s)

        # Step 5: 过滤空条目（无名称且无描述内容）
        active_list = [
            s for s in active_list
            if s.get("name", "") or (isinstance(s.get("content"), dict) and any(
                v for v in s["content"].values()
                if isinstance(v, str) and v.strip() and v != "detected"
            ))
        ]

        # Step 6: 排序 — always 在前，然后按类别 → 按名称
        def _sort_key(s: dict[str, Any]) -> tuple[int, str, str]:
            mode = _tracking(s)
            is_always = 0 if mode == "always" else 1
            return (is_always, s.get("category", ""), s.get("name", ""))
        active_list.sort(key=_sort_key)

        # Step 7: 格式化输出
        return _format_settings_grouped(active_list)


# ── Plot 选择项格式化（模块级） ──

def _format_plot_selection(outline: dict[str, Any] | None,
                           scene_plot: dict[str, Any] | None,
                           arc_ids: list[str],
                           line_ids: list[str]) -> str:
    """按选中项过滤 Plot 数据并格式化为注入文本。"""
    if not outline:
        return ""

    result: list[str] = []

    arcs = outline.get("arcs", [])
    filtered_arcs = [a for a in arcs if not arc_ids or a.get("id") in arc_ids]

    if filtered_arcs:
        result.append("## 项目剧情概要")
        for arc in filtered_arcs:
            result.append(f"### {arc.get('title', 'Arc')}")
            for line in arc.get("lines", []) or []:
                if line_ids and line.get("id") not in line_ids:
                    continue
                lt = line.get("type", "main")
                lt_label = {"main": "主线", "subplot": "支线", "dark": "暗线"}.get(lt, lt)
                result.append(f"- **{line.get('title', '故事线')}**（{lt_label}，{line.get('status', '')}）")
                if line.get("summary"):
                    result.append(f"  {line['summary']}")
                for node in line.get("nodes", []) or []:
                    marker = "~~" if node.get("resolved") else ""
                    ch = f"ch {node.get('start_ch', '?')}~{node.get('end_ch', '?')}" if node.get("start_ch") is not None else ""
                    result.append(f"  - {marker}{node.get('title', '节点')}{marker}（{ch}）")

    if scene_plot:
        result.append("## 当前场景剧情上下文")
        node = scene_plot.get("node", {})
        if node:
            result.append(f"**当前剧情节点**：{node.get('title', '未命名')}")
            if node.get("summary"):
                result.append(str(node["summary"]))
            if node.get("purpose"):
                result.append(f"**节点目的**：{node['purpose']}")
        line = scene_plot.get("line", {})
        if line:
            result.append(f"**所在故事线**：{line.get('title', '')}（{line.get('type', '')}）")
        arc = scene_plot.get("arc", {})
        if arc:
            result.append(f"**所在 Arc**：{arc.get('title', '')}")

        linked = scene_plot.get("linked_nodes", [])
        if linked:
            result.append("#### 关联节点（PlotLink）")
            for ln in linked:
                rel = ln.get("relation_type", "")
                result.append(f"- **{ln.get('title', '')}**（{rel}）：{ln.get('summary', '无摘要')}")

    return "\n".join(result)


class _TemplateQueryProxy:
    """包装 ContextQueryService，提供 Jinja2 安全的模板调用接口

    所有方法返回 str（可直接 {{ }} 渲染），除了 setting_has 返回 bool（用于 {% if %}）。
    实例通过 build_context(query=proxy) 传入模板，天然 per-request 隔离。
    """

    def __init__(self, service: ContextQueryService):
        self._svc = service

    def chapters_before(self, format="summary", limit=0, volume=None) -> str:
        return self._svc.chapters_before(format=format, limit=limit, volume=volume)

    def chapters_after(self, format="summary", limit=0, volume=None) -> str:
        return self._svc.chapters_after(format=format, limit=limit, volume=volume)

    def last_n_chapters(self, n=3, format="summary") -> str:
        return self._svc.last_n_chapters(n=n, format=format)

    def settings(self, categories=None) -> str:
        return self._svc.settings(categories=categories)

    def setting_by_name(self, name: str) -> str:
        return self._svc.setting_by_name(name)

    def setting_has(self, name: str) -> bool:
        return self._svc.setting_has(name)

    def related_settings(self, setting_name: str) -> str:
        return self._svc.related_settings(setting_name)

    def detect_mentions(self, text: str) -> str:
        return self._svc.detect_mentions(text=text)

    def codex_injection(self, text: str = "") -> str:
        return self._svc.codex_injection(text=text)

    def resolved_context(self) -> str:
        """返回前端选择的上下文文本（NC-aligned context selection）"""
        return self._svc.resolved_context()

    def plot_for_current_scene(self) -> dict[str, Any] | None:
        """返回当前 scene 关联的 Plot 上下文数据"""
        return self._svc.plot_for_current_scene()

    def plot_outline(self) -> dict[str, Any] | None:
        """返回项目 Plot 全景概要"""
        return self._svc.plot_outline()
