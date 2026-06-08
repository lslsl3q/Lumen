"""
Prompt 模板管理 API — 模板查看 / 编辑 / 预览

模板元数据存储在 SQLite (templates.db)，
内置模板的 .md.j2 文件作为种子数据在启动时同步。
"""

import re
import logging
import asyncio

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from jinja2.exceptions import TemplateSyntaxError

from lumen.prompt.template_engine import (
    render_messages,
    TemplateError,
    _SYSTEM_SPLIT,
    _ASSISTANT_SPLIT,
    _USER_SPLIT,
    _env,
    load_mock_data,
    build_context,
)
from lumen.services.storage import template_store

logger = logging.getLogger(__name__)
router = APIRouter()


class UpdateTemplateRequest(BaseModel):
    content: str


class PreviewRequest(BaseModel):
    mock_data: dict | None = None
    book_id: str | None = None
    chapter_id: str | None = None


class CreateComponentRequest(BaseModel):
    name: str
    type: str = "prompt_component"
    category: str = "components"
    content: str = ""


# ── Helpers ──

def _reconstruct_content(tmpl: dict) -> str:
    """从 DB 字段重建完整的模板内容字符串（frontmatter + body）"""
    meta = {}
    if tmpl.get("label"):
        meta["name"] = tmpl["label"]
    if tmpl.get("type"):
        meta["type"] = tmpl["type"]
    if tmpl.get("category"):
        meta["category"] = tmpl["category"]
    if tmpl.get("model") and tmpl["model"] != "default":
        meta["model"] = tmpl["model"]
    if tmpl.get("description"):
        meta["description"] = tmpl["description"]
    if tmpl.get("user_created"):
        meta["user_created"] = True

    inputs = tmpl.get("inputs") or []
    own_inputs = [i for i in inputs if not i.get("source_component")]
    if own_inputs:
        meta["inputs"] = _inputs_to_yaml_list(own_inputs)

    frontmatter = yaml.dump(meta, allow_unicode=True, default_flow_style=False, sort_keys=False)
    return f"---\n{frontmatter}---\n{tmpl.get('body', '')}"


def _inputs_to_yaml_list(inputs: list[dict]) -> list[dict]:
    """清理 inputs 以便 YAML 序列化（去掉 source_component 等运行时字段）"""
    result = []
    for inp in inputs:
        clean = {k: v for k, v in inp.items()
                 if k not in ("source_component",) and v is not None and v is not False and v != ""}
        result.append(clean)
    return result


def _parse_content_to_fields(content: str) -> dict:
    """解析完整内容字符串，提取 frontmatter 字段 + body"""
    meta: dict = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
            except yaml.YAMLError:
                pass
            body = parts[2]
    return {
        "label": meta.get("name", ""),
        "type": meta.get("type", ""),
        "category": meta.get("category", ""),
        "model": meta.get("model", "default"),
        "description": meta.get("description", ""),
        "user_created": bool(meta.get("user_created", False)),
        "inputs": list(meta.get("inputs") or []),
        "body": body,
    }


def _tmpl_to_response(tmpl: dict) -> dict:
    """DB template → API 响应格式（保持前端兼容）"""
    content = _reconstruct_content(tmpl)
    return {
        "name": tmpl["name"],
        "path": f"{tmpl['name']}.md.j2",
        "content": content,
        "label": tmpl.get("label", tmpl["name"]),
        "type": tmpl.get("type", ""),
        "category": tmpl.get("category", ""),
        "model": tmpl.get("model", "default"),
        "inputs": tmpl.get("inputs", []),
        "has_user_section": "# --- USER ---" in (tmpl.get("body") or ""),
        "usages": template_store.get_usages(tmpl["name"]),
        "description": tmpl.get("description", ""),
        "user_created": bool(tmpl.get("user_created", False)),
    }


# ── 列出模板 ──

@router.get("/list")
async def list_templates(category: str = "", type: str = ""):
    items = template_store.list_templates(category)
    if type:
        items = [t for t in items if t.get("type") == type]

    grouped: dict[str, list[dict]] = {}
    for item in items:
        cat = item.get("category") or "_root"
        entry = {
            "name": item["name"],
            "path": f"{item['name']}.md.j2",
            "label": item.get("label", item["name"]),
            "type": item.get("type", ""),
            "category": item.get("category", ""),
            "model": item.get("model", "default"),
            "inputs": item.get("inputs", []),
            "description": item.get("description", ""),
            "user_created": bool(item.get("user_created", False)),
        }
        grouped.setdefault(cat, []).append(entry)

    flat = []
    for entries in grouped.values():
        flat.extend(entries)
    return {"templates": flat, "grouped": grouped}


# ── 历史快照（必须在 catch-all GET 之前注册）──

@router.get("/{path:path}/history")
async def get_history(path: str):
    name = path.removesuffix(".md.j2")
    snapshots = template_store.list_snapshots(name)
    return {"snapshots": snapshots}


@router.post("/{path:path}/history/{snapshot_id}/restore")
async def restore_history(path: str, snapshot_id: int):
    name = path.removesuffix(".md.j2")
    restored_name = template_store.restore_snapshot(snapshot_id)
    if not restored_name:
        raise HTTPException(status_code=404, detail="快照不存在")
    return {"status": "restored", "name": restored_name}


# ── 读取模板 ──

@router.get("/{path:path}")
async def get_template(path: str):
    name = path.removesuffix(".md.j2")
    tmpl = template_store.get_template(name)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"模板不存在: {name}")
    return _tmpl_to_response(tmpl)


# ── 更新模板 ──

@router.put("/{path:path}")
async def update_template(path: str, body: UpdateTemplateRequest):
    name = path.removesuffix(".md.j2")
    existing = template_store.get_template(name)
    if not existing:
        raise HTTPException(status_code=404, detail=f"模板不存在: {name}")

    # Jinja2 语法验证
    fields = _parse_content_to_fields(body.content)
    try:
        _env.parse(fields["body"])
    except TemplateSyntaxError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Jinja2 语法错误（第 {e.lineno} 行）", "line": e.lineno, "error": str(e.message)},
        )

    # 创建快照（更新前）
    template_store.create_snapshot(name, summary="编辑保存")

    # 更新 DB
    template_store.upsert_template(
        name=name,
        label=fields["label"] or existing.get("label", ""),
        type=fields["type"] or existing.get("type", ""),
        category=fields["category"] or existing.get("category", ""),
        body=fields["body"],
        model=fields["model"] or existing.get("model", "default"),
        description=fields["description"] or existing.get("description", ""),
        is_builtin=bool(existing.get("is_builtin", False)),
        user_created=bool(existing.get("user_created", False)),
        seed_hash=existing.get("seed_hash", ""),
        inputs=fields["inputs"],
    )

    return {"status": "ok", "name": name, "label": fields["label"] or existing.get("label", "")}


# ── 预览渲染 ──

@router.post("/{path:path}/preview")
async def preview_template(path: str, body: PreviewRequest = None):
    name = path.removesuffix(".md.j2")

    context = build_context()

    if body and body.book_id:
        try:
            from lumen.services.writing.context_query import ContextQueryService, _TemplateQueryProxy
            svc = ContextQueryService(body.book_id, body.chapter_id or "")
            await asyncio.to_thread(svc.preload)
            context["query"] = _TemplateQueryProxy(svc)
        except Exception as e:
            logger.warning("ContextQueryService 预加载失败，回退 mock: %s", e)
            context.update(load_mock_data(name))
    elif body and body.mock_data:
        context.update(body.mock_data)
    else:
        context.update(load_mock_data(name))

    try:
        messages = render_messages(name, context)
    except TemplateError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, "template": e.template_name, "line": e.line},
        )

    # 补回被 render_messages 过滤的空消息段
    try:
        source, _, _ = _env.loader.get_source(_env, f"{name}.md.j2")
        all_markers = []
        for pat, role in [(_SYSTEM_SPLIT, "system"), (_ASSISTANT_SPLIT, "assistant"), (_USER_SPLIT, "user")]:
            for m in pat.finditer(source):
                all_markers.append((m.start(), role))
        all_markers.sort(key=lambda x: x[0])
        expected_roles = [r for _, r in all_markers]

        if len(expected_roles) > len(messages):
            filled = []
            msg_idx = 0
            for role in expected_roles:
                if msg_idx < len(messages) and messages[msg_idx]["role"] == role:
                    filled.append(messages[msg_idx])
                    msg_idx += 1
                else:
                    filled.append({"role": role, "content": ""})
            messages = filled
    except Exception:
        pass

    return {
        "name": name,
        "messages": messages,
        "system": next((m["content"] for m in messages if m["role"] == "system"), ""),
        "user": next((m["content"] for m in messages if m["role"] == "user"), ""),
    }


# ── 创建 Prompt Component ──

@router.post("/components", status_code=201)
async def create_component(body: CreateComponentRequest):
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", body.name).strip("_")
    if not safe_name:
        raise HTTPException(status_code=400, detail="名称无效")

    name = f"{body.category or 'components'}/{safe_name}"

    existing = template_store.get_template(name)
    if existing:
        raise HTTPException(status_code=409, detail=f"模板已存在: {name}")

    template_store.upsert_template(
        name=name,
        label=body.name,
        type=body.type,
        category=body.category or "components",
        body=body.content,
        user_created=True,
        inputs=[],
    )

    return {"status": "created", "name": name, "path": f"{name}.md.j2"}


# ── 删除模板 ──

@router.delete("/{path:path}")
async def delete_template(path: str):
    name = path.removesuffix(".md.j2")

    tmpl = template_store.get_template(name)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"模板不存在: {name}")

    if not template_store.delete_template(name):
        raise HTTPException(status_code=500, detail="删除失败")

    return {"status": "deleted", "name": name}
