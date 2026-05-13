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

from jinja2 import FileSystemLoader, select_autoescape
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


class _FrontmatterLoader(FileSystemLoader):
    """自定义加载器：返回模板源前剥离 YAML frontmatter"""

    def get_source(self, environment, template):
        source, filename, uptodate = super().get_source(environment, template)
        return _strip_frontmatter(source), filename, uptodate


_env = SandboxedEnvironment(
    loader=_FrontmatterLoader(_TEMPLATES_DIR),
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


_env.filters["join_zh"] = _filter_join_zh
_env.filters["default_if_empty"] = _filter_default_if_empty


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


# 模板内 system/user 分隔标记
_SYSTEM_USER_SPLIT = re.compile(r"^# --- SYSTEM ---\s*$", re.MULTILINE)
_USER_SPLIT = re.compile(r"^# --- USER ---\s*$", re.MULTILINE)


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
    try:
        source, _, _ = _env.loader.get_source(_env, f"{template_name}.md.j2")
    except TemplateNotFound:
        raise TemplateError(template_name, 0, "模板文件不存在")

    sys_start = _SYSTEM_USER_SPLIT.search(source)
    user_start = _USER_SPLIT.search(source)

    if not sys_start:
        # 无分隔线 → 整个是 system（component 单层模板用 render() 就够了）
        return render(template_name, context), ""

    system_tpl = source[sys_start.end():user_start.start() if user_start else None].strip()
    user_tpl = source[user_start.end():].strip() if user_start else ""

    try:
        system_rendered = _env.from_string(system_tpl).render(**context)
    except TemplateSyntaxError as e:
        raise TemplateError(template_name, e.lineno or 0, str(e.message)) from e

    user_rendered = ""
    if user_tpl:
        try:
            user_rendered = _env.from_string(user_tpl).render(**context)
        except TemplateSyntaxError as e:
            raise TemplateError(template_name, e.lineno or 0, str(e.message)) from e

    return system_rendered, user_rendered


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


def get_template_names(category: str = "") -> list[dict]:
    """列出可用模板（含 frontmatter 元数据）

    Args:
        category: 按目录过滤，如 "writing"。空字符串列出所有。

    Returns:
        [{"name": "writing/continue", "path": "writing/continue.md.j2",
          "label": "续写", "type": "text_replacement", "category": "writing"}, ...]
    """
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
            entry = {
                "name": name,
                "path": rel.replace("\\", "/"),
                "label": meta.get("name", name),
                "type": meta.get("type", ""),
                "category": meta.get("category", name.split("/")[0]),
                "model": meta.get("model", "default"),
            }
            results.append(entry)

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
