"""
Prompt 模板管理 API — 模板查看 / 编辑 / 预览

模板文件是 Jinja2 (.md.j2)，存放于 lumen/data/templates/ 目录。
每个模板旁可放 .mock.json 提供默认预览数据。
"""

import os
import re
import logging

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from jinja2.exceptions import TemplateSyntaxError

from lumen.prompt.template_engine import (
    render_message,
    TemplateError,
    get_template_names,
    load_mock_data,
    build_context,
    _parse_frontmatter,
    _TEMPLATES_DIR,
    _env,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_TEMPLATES_REAL = os.path.realpath(_TEMPLATES_DIR)


def _validate_path(path: str) -> tuple[str, str]:
    """验证路径不超出 templates 目录，返回 (template_name, j2_path)"""
    template_name = path.removesuffix(".md.j2")
    j2_path = os.path.realpath(os.path.join(_TEMPLATES_DIR, f"{template_name}.md.j2"))
    if not j2_path.startswith(_TEMPLATES_REAL):
        raise HTTPException(status_code=400, detail="非法路径")
    return template_name, j2_path


class UpdateTemplateRequest(BaseModel):
    content: str


class PreviewRequest(BaseModel):
    mock_data: dict | None = None
    book_id: str | None = None
    chapter_id: str | None = None


# ── 列出模板 ──

@router.get("/list")
async def list_templates(category: str = "", type: str = ""):
    """列出所有可用模板（按 frontmatter category 分组，可选 type 筛选）"""
    items = get_template_names(category)
    if type:
        items = [t for t in items if t.get("type") == type]

    grouped: dict[str, list[dict]] = {}
    for item in items:
        cat = item.get("category") or "_root"
        grouped.setdefault(cat, []).append(item)
    return {"templates": items, "grouped": grouped}


# ── 读取模板 ──

@router.get("/{path:path}")
async def get_template(path: str):
    """读取模板文件内容，返回元数据和分段信息"""
    template_name, j2_path = _validate_path(path)

    if not os.path.isfile(j2_path):
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_name}")

    try:
        with open(j2_path, "r", encoding="utf-8") as f:
            content = f.read()
    except IOError as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")

    meta, body = _parse_frontmatter(j2_path)
    has_user_section = "# --- USER ---" in body

    # Compute usages: which templates include this component
    usages: list[str] = []
    include_pattern = re.compile(r'\{%[-\s]*include\s+"([^"]+)"\s*[-]?%}')
    component_rel = f"{template_name}.md.j2"
    for other in get_template_names():
        other_name = other.get("name", "")
        if other_name == template_name:
            continue
        other_path = os.path.join(_TEMPLATES_DIR, f"{other_name}.md.j2")
        if not os.path.isfile(other_path):
            continue
        try:
            with open(other_path, "r", encoding="utf-8") as f:
                other_content = f.read()
            for match in include_pattern.finditer(other_content):
                if match.group(1) == component_rel or match.group(1).endswith(component_rel):
                    usages.append(other.get("label", other_name))
                    break
        except IOError:
            continue

    return {
        "name": template_name,
        "path": f"{template_name}.md.j2",
        "content": content,
        "label": meta.get("name", template_name),
        "type": meta.get("type", ""),
        "category": meta.get("category", ""),
        "model": meta.get("model", "default"),
        "has_user_section": has_user_section,
        "usages": usages,
    }


# ── 更新模板 ──

@router.put("/{path:path}")
async def update_template(path: str, body: UpdateTemplateRequest):
    """更新模板文件内容"""
    template_name, j2_path = _validate_path(path)

    if not os.path.isfile(j2_path):
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_name}")

    # 语法验证（复用已有 Environment）
    try:
        _env.parse(body.content)
    except TemplateSyntaxError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Jinja2 语法错误（第 {e.lineno} 行）", "line": e.lineno, "error": str(e.message)},
        )

    try:
        with open(j2_path, "w", encoding="utf-8") as f:
            f.write(body.content)
    except IOError as e:
        raise HTTPException(status_code=500, detail=f"写入失败: {e}")

    return {"status": "ok", "name": template_name}


# ── 预览渲染 ──

@router.post("/{path:path}/preview")
async def preview_template(path: str, body: PreviewRequest = None):
    """用 mock 数据或真实上下文预览模板渲染结果"""
    import asyncio
    template_name, _ = _validate_path(path)

    context = build_context()

    # 如果提供了 book_id，用 ContextQueryService 注入真实数据
    if body and body.book_id:
        try:
            from lumen.services.writing.context_query import ContextQueryService, _TemplateQueryProxy
            svc = ContextQueryService(body.book_id, body.chapter_id or "")
            await asyncio.to_thread(svc.preload)
            query_proxy = _TemplateQueryProxy(svc)
            context["query"] = query_proxy
        except Exception as e:
            logger.warning(f"ContextQueryService 预加载失败，回退 mock: {e}")
            context.update(load_mock_data(template_name))
    elif body and body.mock_data:
        context.update(body.mock_data)
    else:
        context.update(load_mock_data(template_name))

    try:
        system_part, user_part = render_message(template_name, context)
    except TemplateError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, "template": e.template_name, "line": e.line},
        )

    return {"name": template_name, "system": system_part, "user": user_part}


# ── 创建 Prompt Component ──

class CreateComponentRequest(BaseModel):
    name: str
    type: str = "prompt_component"
    category: str = "components"
    content: str = ""


@router.post("/components", status_code=201)
async def create_component(body: CreateComponentRequest):
    """创建新的 Prompt Component（单层模板）

    文件名自动生成：components/<sanitized_name>.md.j2
    """
    import re as _re

    safe_name = _re.sub(r"[^a-zA-Z0-9_\-]", "_", body.name).strip("_")
    if not safe_name:
        raise HTTPException(status_code=400, detail="名称无效")

    dir_path = os.path.join(_TEMPLATES_DIR, body.category or "components")
    os.makedirs(dir_path, exist_ok=True)

    file_path = os.path.join(dir_path, f"{safe_name}.md.j2")
    if os.path.exists(file_path):
        raise HTTPException(status_code=409, detail=f"模板已存在: {safe_name}")

    meta = {"name": body.name, "type": body.type, "category": body.category}
    frontmatter = "---\n" + yaml.dump(meta, allow_unicode=True, default_flow_style=False) + "---\n"
    full_content = frontmatter + body.content

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(full_content)
    except IOError as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {e}")

    rel = os.path.relpath(file_path, _TEMPLATES_DIR).replace("\\", "/")
    template_name = rel.removesuffix(".md.j2")

    return {
        "status": "created",
        "name": template_name,
        "path": rel,
    }


# ── 删除模板 ──

@router.delete("/{path:path}")
async def delete_template(path: str):
    """删除模板文件"""
    template_name, j2_path = _validate_path(path)

    if not os.path.isfile(j2_path):
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_name}")

    try:
        os.remove(j2_path)
    except IOError as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")

    return {"status": "deleted", "name": template_name}
