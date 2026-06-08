"""
Lumen - Jinja2 Prompt 模板引擎

替代 template.py 的正则替换，提供完整的模板能力：
变量替换、条件渲染、循环、组件 include、过滤器。

系统变量放在 sys 命名空间下（sys.date_time），业务变量直接铺开。
"""

import json
import os
import re
import logging
import platform
from datetime import datetime

import yaml

from jinja2 import FileSystemLoader, select_autoescape, BaseLoader
from jinja2.sandbox import SandboxedEnvironment
from jinja2.exceptions import TemplateSyntaxError, TemplateNotFound

from lumen.config import DATA_DIR

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = os.path.join(DATA_DIR, "templates")


def _strip_frontmatter(source: str) -> str:
    """剥离模板源的 YAML frontmatter，返回 body"""
    if source.startswith("---"):
        parts = source.split("---", 2)
        if len(parts) >= 3:
            return parts[2]
    return source


class _TemplateLoader(BaseLoader):
    """混合加载器：优先从 SQLite 读，回退到文件系统"""

    def __init__(self, templates_dir: str):
        self._fs_loader = FileSystemLoader(templates_dir)
        self._templates_dir = templates_dir

    def get_source(self, environment, template):
        name = template.removesuffix(".md.j2")

        # 优先从 SQLite 读
        try:
            from lumen.services.storage.template_store import get_template
            tmpl = get_template(name)
            if tmpl and tmpl["body"]:
                source = tmpl["body"]
                updated_at = tmpl["updated_at"]
                def uptodate():
                    from lumen.services.storage.template_store import get_template
                    current = get_template(name)
                    return current is not None and current["updated_at"] == updated_at
                return source, template, uptodate
        except Exception as e:
            logger.debug("SQLite 加载失败 %s，回退文件: %s", template, e)

        # 回退：从文件系统读（兼容旧路径 / 首次启动）
        source, filename, fs_uptodate = self._fs_loader.get_source(environment, template)
        return _strip_frontmatter(source), filename, fs_uptodate


_env = SandboxedEnvironment(
    loader=_TemplateLoader(_TEMPLATES_DIR),
    auto_reload=True,
    cache_size=50,
    autoescape=select_autoescape(default=False),
)


# ── 自定义过滤器 ──

def _filter_join_zh(items: list, separator: str = "、") -> str:
    return separator.join(str(i) for i in items)


def _filter_default_if_empty(value, default=""):
    if not value:
        return default
    return value


def _filter_exclude_presets(text: str, presets: str) -> str:
    """从自由文本中去掉已匹配的预设选项，只保留用户自定义指令

    presets 为逗号分隔的预设关键词列表。
    """
    if not text:
        return ""
    keywords = [k.strip() for k in presets.split(",") if k.strip()]
    result = text
    for kw in keywords:
        result = result.replace(kw, "")
    # 清除残余的逗号、顿号和多余空白
    import re
    result = re.sub(r"[,，、]\s*[,，、]*", "", result)
    return result.strip()


_env.filters["join_zh"] = _filter_join_zh
_env.filters["default_if_empty"] = _filter_default_if_empty
_env.filters["exclude_presets"] = _filter_exclude_presets


# ── 自定义全局函数（可在模板中直接调用）──

def _global_word_count(text: str) -> int:
    """统计文本字数（中文按字符数）"""
    return len(str(text)) if text else 0


def _global_either(a, b):
    """返回第一个非空值，两个都空返回空字符串

    使用 truthiness 判断（非 is None），因此 0、False、空字符串均视为"空"并回退到 b。
    """
    return a if a else b


_env.globals["word_count"] = _global_word_count
_env.globals["either"] = _global_either


# ── Context builder ──

def build_context(
    character_id: str = "default",
    text_before_cursor: str = "",
    text_after_cursor: str = "",
    **extra,
) -> dict:
    """构建 Jinja2 模板的上下文数据

    系统变量放 sys 命名空间下，业务变量直接铺开。
    编辑器上下文变量（text_before_cursor / text_after_cursor）供模板
    用 Jinja2 原生语法使用：{% if text_before_cursor %} {{ text_before_cursor[-200:] }} {% endif %}
    """
    now = datetime.now()
    weekdays = ["一", "二", "三", "四", "五", "六", "日"]

    sys_vars = {
        "current_date": now.strftime('%Y年%m月%d日'),
        "current_time": now.strftime('%H:%M:%S'),
        "current_weekday": f"星期{weekdays[now.weekday()]}",
        "date_time": (
            f"{now.strftime('%Y年%m月%d日')} {now.strftime('%H:%M:%S')}，"
            f"星期{weekdays[now.weekday()]}"
        ),
        "os_name": platform.system(),
        "os_version": platform.version(),
        "python_version": platform.python_version(),
        "system_info": (
            f"操作系统: {platform.system()} {platform.release()} "
            f"({platform.version()})\n架构: {platform.machine()}"
        ),
    }

    # 记忆上下文（延迟导入避免循环依赖）
    try:
        from lumen.services.memory import get_memory_context
        memory_text = get_memory_context(character_id)
        if memory_text:
            sys_vars["memory"] = memory_text
    except Exception as e:
        logger.debug("获取记忆上下文失败(%s): %s", character_id, e)

    ctx = {"sys": sys_vars}
    if text_before_cursor:
        ctx["text_before_cursor"] = text_before_cursor
    if text_after_cursor:
        ctx["text_after_cursor"] = text_after_cursor
    ctx.update(extra)
    return ctx


# ── 渲染接口 ──

class TemplateError(Exception):
    """模板渲染错误，包含行号和友好信息"""
    def __init__(self, template_name: str, line: int, message: str):
        self.template_name = template_name
        self.line = line
        self.message = message
        super().__init__(f"模板 {template_name} 第 {line} 行错误: {message}")


# 模板内消息分隔标记
_SYSTEM_SPLIT = re.compile(r"^# --- SYSTEM ---\s*$", re.MULTILINE)
_ASSISTANT_SPLIT = re.compile(r"^# --- ASSISTANT ---\s*$", re.MULTILINE)
_USER_SPLIT = re.compile(r"^# --- USER ---\s*$", re.MULTILINE)

# 保留旧别名兼容
_SYSTEM_USER_SPLIT = _SYSTEM_SPLIT


def render(template_name: str, context: dict) -> str:
    """渲染模板，返回渲染后的文本

    Args:
        template_name: 模板名（不含目录前缀和后缀），如 "writing/continue"
        context: 模板上下文数据

    Returns:
        渲染后的文本

    Raises:
        TemplateError: 模板语法错误或不存在
    """
    try:
        template = _env.get_template(f"{template_name}.md.j2")
        return template.render(**context)
    except TemplateNotFound:
        raise TemplateError(template_name, 0, "模板文件不存在")
    except TemplateSyntaxError as e:
        raise TemplateError(template_name, e.lineno or 0, str(e.message)) from e


def render_message(template_name: str, context: dict) -> tuple[str, str]:
    """渲染双层模板，返回 (system_prompt, user_prompt)

    模板用 # --- SYSTEM --- 和 # --- USER --- 分隔。
    没有分隔线的旧模板 → 整个当作 system，user 为空。

    Args:
        template_name: 模板名
        context: 模板上下文数据

    Returns:
        (system_prompt, user_prompt)
    """
    messages = render_messages(template_name, context)
    if not messages:
        return "", ""
    system_part = next((m["content"] for m in messages if m["role"] == "system"), "")
    user_part = next((m["content"] for m in messages if m["role"] == "user"), "")
    return system_part, user_part


def render_messages(template_name: str, context: dict) -> list[dict]:
    """渲染多消息模板，返回 [{"role": ..., "content": ...}, ...]

    支持 # --- SYSTEM --- / # --- ASSISTANT --- / # --- USER --- 分隔。
    可有多条 USER 段，按出现顺序排列。

    Args:
        template_name: 模板名
        context: 模板上下文数据

    Returns:
        消息列表 [{"role": "system"|"user"|"assistant", "content": str}, ...]
    """
    try:
        source, _, _ = _env.loader.get_source(_env, f"{template_name}.md.j2")
    except TemplateNotFound:
        raise TemplateError(template_name, 0, "模板文件不存在")

    # 找出所有分隔标记（match_start, content_start, role）
    _ALL_SPLITS = [
        (_SYSTEM_SPLIT, "system"),
        (_ASSISTANT_SPLIT, "assistant"),
        (_USER_SPLIT, "user"),
    ]
    markers = []
    for pattern, role in _ALL_SPLITS:
        for m in pattern.finditer(source):
            markers.append((m.start(), m.end(), role))

    if not markers:
        return [{"role": "system", "content": render(template_name, context)}]

    markers.sort(key=lambda x: x[0])

    segments = []
    for i, (line_start, content_start, role) in enumerate(markers):
        end = markers[i + 1][0] if i + 1 < len(markers) else len(source)
        raw = source[content_start:end].strip()

        try:
            rendered = _env.from_string(raw).render(**context)
        except TemplateSyntaxError as e:
            raise TemplateError(template_name, e.lineno or 0, str(e.message)) from e

        if rendered.strip():
            segments.append({"role": role, "content": rendered})

    return segments


def _parse_frontmatter(file_path: str) -> tuple[dict, str]:
    """解析模板文件的 YAML frontmatter

    模板文件格式：
        ---
        name: "续写"
        type: text_replacement
        category: writing
        ---

        # --- SYSTEM ---
        ...

    Returns:
        (metadata_dict, body_text)
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    if not content.startswith("---"):
        return {}, content

    # 提取 frontmatter 内容（第一个和第二个 --- 之间）
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        logger.warning("YAML frontmatter 解析失败: %s", file_path)
        meta = {}

    return meta, _strip_frontmatter(content)


# ── Include 链 inputs 解析 ──

_INCLUDE_RE = re.compile(r'\{%[-\s]*include\s+"([^"]+)"\s*[-]?%}')


def resolve_inputs(template_name: str) -> list[dict]:
    """解析模板及其 include 链的完整 inputs 列表

    优先从 SQLite 读取（模板 DB），回退到文件解析。
    """
    try:
        from lumen.services.storage.template_store import get_template
        tmpl = get_template(template_name)
        if tmpl:
            return _resolve_includes_from_db(template_name, set())
    except Exception:
        pass
    return _resolve_inputs_from_files(template_name, set())


def _resolve_includes_from_db(template_name: str, visited: set[str]) -> list[dict]:
    """从 SQLite 递归解析 include 链的 inputs"""
    from lumen.services.storage.template_store import get_template as db_get

    if template_name in visited:
        return []
    visited.add(template_name)

    tmpl = db_get(template_name)
    if not tmpl:
        return []

    own_inputs = [i for i in (tmpl.get("inputs") or []) if not i.get("source_component")]

    inherited: list[dict] = []
    for match in _INCLUDE_RE.finditer(tmpl.get("body", "")):
        comp_name = match.group(1).removesuffix(".md.j2")
        child_inputs = _resolve_includes_from_db(comp_name, visited)
        for inp in child_inputs:
            entry = dict(inp)
            if "source_component" not in entry:
                entry["source_component"] = comp_name
            inherited.append(entry)

    # 合并：own inputs 优先，去重（同名只保留 own 版本）
    own_names = {inp["name"] for inp in own_inputs if "name" in inp}
    result = list(own_inputs)
    seen = set(own_names)
    for inp in inherited:
        name = inp.get("name")
        if name and name not in seen:
            result.append(inp)
            seen.add(name)

    return result


def _resolve_inputs_from_files(template_name: str, visited: set[str]) -> list[dict]:
    """文件系统回退：递归解析 include 链的 inputs"""
    if template_name in visited:
        return []
    visited.add(template_name)

    j2_path = os.path.join(_TEMPLATES_DIR, f"{template_name}.md.j2")
    if not os.path.isfile(j2_path):
        return []

    meta, body = _parse_frontmatter(j2_path)
    own_inputs = list(meta.get("inputs") or [])

    inherited: list[dict] = []
    for match in _INCLUDE_RE.finditer(body):
        comp_name = match.group(1).removesuffix(".md.j2")
        child_inputs = _resolve_inputs_from_files(comp_name, visited)
        for inp in child_inputs:
            entry = dict(inp)
            if "source_component" not in entry:
                entry["source_component"] = comp_name
            inherited.append(entry)

    own_names = {inp["name"] for inp in own_inputs if "name" in inp}
    result = list(own_inputs)
    seen = set(own_names)
    for inp in inherited:
        name = inp.get("name")
        if name and name not in seen:
            result.append(inp)
            seen.add(name)

    return result


def get_template_names(category: str = "") -> list[dict]:
    """列出可用模板（优先从 DB 读取，回退到文件系统）"""
    try:
        from lumen.services.storage.template_store import list_templates as db_list
        items = db_list(category)
        return [
            {
                "name": t["name"],
                "path": f"{t['name']}.md.j2",
                "label": t.get("label", t["name"]),
                "type": t.get("type", ""),
                "category": t.get("category", ""),
                "model": t.get("model", "default"),
                "inputs": t.get("inputs", []),
                "description": t.get("description", ""),
                "user_created": bool(t.get("user_created", False)),
            }
            for t in items
        ]
    except Exception:
        pass

    # 文件系统回退
    results = []
    search_dir = os.path.join(_TEMPLATES_DIR, category) if category else _TEMPLATES_DIR
    if not os.path.isdir(search_dir):
        return results
    for root, _dirs, files in os.walk(search_dir):
        for f in sorted(files):
            if not f.endswith(".md.j2"):
                continue
            full_path = os.path.join(root, f)
            rel = os.path.relpath(full_path, _TEMPLATES_DIR)
            name = rel.removesuffix(".md.j2").replace("\\", "/")
            meta, _ = _parse_frontmatter(full_path)
            results.append({
                "name": name,
                "path": rel.replace("\\", "/"),
                "label": meta.get("name", name),
                "type": meta.get("type", ""),
                "category": meta.get("category", name.split("/")[0]),
                "model": meta.get("model", "default"),
                "inputs": meta.get("inputs", []),
                "description": meta.get("description", ""),
                "user_created": meta.get("user_created", False),
            })
    return results


def load_mock_data(template_name: str) -> dict:
    """加载模板对应的默认 mock 数据

    模板 writing/continue.md.j2 对应 writing/continue.mock.json
    """
    mock_path = os.path.join(_TEMPLATES_DIR, f"{template_name}.mock.json")
    if not os.path.exists(mock_path):
        return {}
    try:
        with open(mock_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.warning("加载 mock 数据失败 %s: %s", mock_path, e)
        return {}
