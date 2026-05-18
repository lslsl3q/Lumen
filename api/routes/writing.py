"""
T11 写作模式 REST API — 作品/章节/世界观设定 CRUD
"""

import asyncio
import json
import logging
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from lumen.services.storage.writing import (
    create_project, list_projects, get_project, update_project, delete_project,
    create_chapter, list_chapters, get_chapter, update_chapter, delete_chapter, reorder_chapters,
    create_setting, list_settings, get_setting, update_setting, delete_setting, reorder_settings,
    # NEW:
    create_act, list_acts, get_act, update_act, delete_act, reorder_acts,
    create_scene, list_scenes, get_scene, update_scene, delete_scene, reorder_scenes,
    get_manuscript, get_manuscript_flat,
)
from lumen.services.storage.writing_snapshot import (
    create_snapshot, list_snapshots, get_snapshot_detail, restore_snapshot, delete_snapshot,
)
from lumen.services.storage.writing_migration import needs_migration, run_migration

logger = logging.getLogger(__name__)
router = APIRouter()


# ── 请求模型 ──

class CreateActRequest(BaseModel):
    project_id: str
    title: str = ""
    numerate: bool = True


class UpdateActRequest(BaseModel):
    title: str | None = None
    numerate: bool | None = None


class ReorderActsRequest(BaseModel):
    project_id: str
    ordered_ids: list[str]


class CreateChapterV2Request(BaseModel):
    act_id: str
    project_id: str
    title: str = ""


class UpdateChapterV2Request(BaseModel):
    title: str | None = None
    numerate: bool | None = None
    show_number: bool | None = None


class ReorderChaptersV2Request(BaseModel):
    act_id: str
    ordered_ids: list[str]


class CreateSceneRequest(BaseModel):
    chapter_id: str
    content: dict | None = None
    summary: str = ""
    subtitle: str = ""


class UpdateSceneRequest(BaseModel):
    content: dict | None = None
    summary: str | None = None
    subtitle: str | None = None


class ReorderScenesRequest(BaseModel):
    chapter_id: str
    ordered_ids: list[str]


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
    channel_id: str = ""


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    metadata: dict | None = None


class CreateChapterRequest(BaseModel):
    project_id: str
    title: str = "新章节"
    volume: str = ""


class UpdateChapterRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    word_count: int | None = None
    volume: str | None = None


class ReorderChaptersRequest(BaseModel):
    project_id: str
    ordered_ids: list[str]


class CreateSettingRequest(BaseModel):
    project_id: str
    name: str
    category: str = "custom"
    parent_id: str | None = None
    content: dict = Field(default_factory=dict)


class UpdateSettingRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    content: dict | None = None
    enabled: int | None = None
    parent_id: str | None = None


class ReorderSettingsRequest(BaseModel):
    ordered_ids: list[str]


class CreateSnapshotRequest(BaseModel):
    label: str = ""
    type: str = "manual"


# ── 作品 ──

@router.get("/projects")
async def api_list_projects():
    try:
        return await asyncio.to_thread(list_projects)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects")
async def api_create_project(req: CreateProjectRequest):
    try:
        return await asyncio.to_thread(
            create_project, req.name, req.description, req.channel_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}")
async def api_get_project(project_id: str):
    proj = await asyncio.to_thread(get_project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="作品不存在")
    return proj


@router.patch("/projects/{project_id}")
async def api_update_project(project_id: str, req: UpdateProjectRequest):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    proj = await asyncio.to_thread(update_project, project_id, **updates)
    if not proj:
        raise HTTPException(status_code=404, detail="作品不存在")
    return proj


@router.delete("/projects/{project_id}")
async def api_delete_project(project_id: str):
    await asyncio.to_thread(delete_project, project_id)
    return {"status": "deleted"}


# ── 章节 ──

@router.get("/projects/{project_id}/chapters")
async def api_list_chapters(project_id: str):
    return await asyncio.to_thread(list_chapters, project_id)


@router.post("/chapters")
async def api_create_chapter(req: CreateChapterRequest):
    return await asyncio.to_thread(
        create_chapter, req.project_id, req.title, req.volume
    )


@router.get("/chapters/{chapter_id}")
async def api_get_chapter(chapter_id: str):
    ch = await asyncio.to_thread(get_chapter, chapter_id)
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    return ch


@router.patch("/chapters/{chapter_id}")
async def api_update_chapter(chapter_id: str, req: UpdateChapterRequest):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    ch = await asyncio.to_thread(update_chapter, chapter_id, **updates)
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    return ch


@router.delete("/chapters/{chapter_id}")
async def api_delete_chapter(chapter_id: str):
    await asyncio.to_thread(delete_chapter, chapter_id)
    return {"status": "deleted"}


@router.post("/chapters/reorder")
async def api_reorder_chapters(req: ReorderChaptersRequest):
    await asyncio.to_thread(reorder_chapters, req.project_id, req.ordered_ids)
    return {"status": "reordered"}


# ── Act ──

@router.get("/projects/{project_id}/acts")
async def api_list_acts(project_id: str):
    return await asyncio.to_thread(list_acts, project_id)


@router.post("/acts")
async def api_create_act(req: CreateActRequest):
    return await asyncio.to_thread(create_act, req.project_id, req.title, req.numerate)


@router.get("/acts/{act_id}")
async def api_get_act(act_id: str):
    a = await asyncio.to_thread(get_act, act_id)
    if not a:
        raise HTTPException(status_code=404, detail="Act not found")
    return a


@router.patch("/acts/{act_id}")
async def api_update_act(act_id: str, req: UpdateActRequest):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    a = await asyncio.to_thread(update_act, act_id, **updates)
    if not a:
        raise HTTPException(status_code=404, detail="Act not found")
    return a


@router.delete("/acts/{act_id}")
async def api_delete_act(act_id: str):
    await asyncio.to_thread(delete_act, act_id)
    return {"status": "deleted"}


@router.post("/acts/reorder")
async def api_reorder_acts(req: ReorderActsRequest):
    await asyncio.to_thread(reorder_acts, req.project_id, req.ordered_ids)
    return {"status": "reordered"}


# ── 世界观设定 ──

@router.get("/projects/{project_id}/settings")
async def api_list_settings(project_id: str, category: str | None = None):
    return await asyncio.to_thread(list_settings, project_id, category)


@router.post("/settings")
async def api_create_setting(req: CreateSettingRequest):
    return await asyncio.to_thread(
        create_setting, req.project_id, req.name, req.category, req.parent_id, req.content
    )


@router.get("/settings/{setting_id}")
async def api_get_setting(setting_id: str):
    s = await asyncio.to_thread(get_setting, setting_id)
    if not s:
        raise HTTPException(status_code=404, detail="设定不存在")
    return s


@router.patch("/settings/{setting_id}")
async def api_update_setting(setting_id: str, req: UpdateSettingRequest):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    s = await asyncio.to_thread(update_setting, setting_id, **updates)
    if not s:
        raise HTTPException(status_code=404, detail="设定不存在")
    return s


@router.delete("/settings/{setting_id}")
async def api_delete_setting(setting_id: str):
    await asyncio.to_thread(delete_setting, setting_id)
    return {"status": "deleted"}


@router.post("/settings/reorder")
async def api_reorder_settings(req: ReorderSettingsRequest):
    await asyncio.to_thread(reorder_settings, req.ordered_ids)
    return {"status": "reordered"}


# ── Scene ──

@router.get("/chapters/{chapter_id}/scenes")
async def api_list_scenes(chapter_id: str):
    return await asyncio.to_thread(list_scenes, chapter_id)


@router.post("/scenes")
async def api_create_scene(req: CreateSceneRequest):
    return await asyncio.to_thread(create_scene, req.chapter_id, req.content, req.summary, req.subtitle)


@router.get("/scenes/{scene_id}")
async def api_get_scene(scene_id: str):
    s = await asyncio.to_thread(get_scene, scene_id)
    if not s:
        raise HTTPException(status_code=404, detail="Scene not found")
    return s


@router.patch("/scenes/{scene_id}")
async def api_update_scene(scene_id: str, req: UpdateSceneRequest):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    s = await asyncio.to_thread(update_scene, scene_id, **updates)
    if not s:
        raise HTTPException(status_code=404, detail="Scene not found")
    return s


@router.delete("/scenes/{scene_id}")
async def api_delete_scene(scene_id: str):
    await asyncio.to_thread(delete_scene, scene_id)
    return {"status": "deleted"}


@router.post("/scenes/reorder")
async def api_reorder_scenes(req: ReorderScenesRequest):
    await asyncio.to_thread(reorder_scenes, req.chapter_id, req.ordered_ids)
    return {"status": "reordered"}


# ── 快照 ──

@router.get("/projects/{project_id}/snapshots")
async def api_list_snapshots(project_id: str, limit: int = 50):
    items = await asyncio.to_thread(list_snapshots, project_id, limit)
    return {"items": items, "total": len(items)}


@router.post("/projects/{project_id}/snapshots")
async def api_create_snapshot(project_id: str, req: CreateSnapshotRequest):
    try:
        return await asyncio.to_thread(
            create_snapshot, project_id, req.type, req.label
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/snapshots/{snapshot_id}")
async def api_get_snapshot(snapshot_id: str):
    snap = await asyncio.to_thread(get_snapshot_detail, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="快照不存在")
    return snap


@router.post("/snapshots/{snapshot_id}/restore")
async def api_restore_snapshot(snapshot_id: str):
    try:
        return await asyncio.to_thread(restore_snapshot, snapshot_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/snapshots/{snapshot_id}")
async def api_delete_snapshot(snapshot_id: str):
    await asyncio.to_thread(delete_snapshot, snapshot_id)
    return {"status": "deleted"}


# ── 导出 ──

def _pm_json_to_plain_text(content_str: str) -> str:
    """Extract plain text from ProseMirror JSON."""
    try:
        doc = json.loads(content_str) if isinstance(content_str, str) else content_str
    except json.JSONDecodeError:
        return content_str
    texts = []
    def walk(node):
        if node.get("type") == "text" and node.get("text"):
            texts.append(node["text"])
        for child in node.get("content", []):
            walk(child)
    walk(doc)
    return "\n\n".join(texts)


def _pm_json_to_markdown(content_str: str) -> str:
    """Convert ProseMirror JSON to basic Markdown."""
    try:
        doc = json.loads(content_str) if isinstance(content_str, str) else content_str
    except json.JSONDecodeError:
        return content_str
    lines = []
    def walk(node):
        t = node.get("type", "")
        if t == "heading":
            lines.append("#" * node.get("attrs", {}).get("level", 1) + " " + _collect_text(node))
        elif t == "paragraph":
            lines.append(_collect_text(node))
        elif t == "bulletList":
            for item in node.get("content", []):
                lines.append("- " + _collect_text(item))
        elif t == "orderedList":
            for i, item in enumerate(node.get("content", []), 1):
                lines.append(f"{i}. " + _collect_text(item))
        elif t == "blockquote":
            for child in node.get("content", []):
                lines.append("> " + _collect_text(child))
        else:
            for child in node.get("content", []):
                walk(child)
    walk(doc)
    return "\n\n".join(lines)


def _collect_text(node) -> str:
    texts = []
    def walk(n):
        if n.get("type") == "text" and n.get("text"):
            texts.append(n["text"])
        for child in n.get("content", []):
            walk(child)
    walk(node)
    return "".join(texts)


def _safe_filename(name: str) -> str:
    """清理文件名：去除路径分隔符、换行、控制字符"""
    return re.sub(r'[/\\:\n\r\t\0]', '_', name).strip('. ')


@router.get("/projects/{project_id}/export")
async def api_export_project(project_id: str, format: str = "txt"):
    """Export entire project as TXT / Markdown / DOCX from new acts/chapters/scenes model."""
    manuscript = await asyncio.to_thread(get_manuscript, project_id)
    acts = manuscript.get("acts", [])
    if not acts:
        raise HTTPException(404, "No content to export")

    project = await asyncio.to_thread(get_project, project_id)
    title = project["name"] if project else "未命名"
    safe_title = _safe_filename(title)

    if format == "md":
        parts = [f"# {title}\n\n"]
        for act in acts:
            parts.append(f"## Act: {act['title']}\n\n")
            for ch in act.get("chapters", []):
                parts.append(f"### {ch['title']}\n\n")
                for sc in ch.get("scenes", []):
                    parts.append(_pm_json_to_markdown(sc.get("content", "{}")))
                    parts.append("\n\n---\n\n")
        return PlainTextResponse("".join(parts), media_type="text/markdown",
                                 headers={"Content-Disposition": f"attachment; filename={safe_title}.md"})

    elif format == "docx":
        from docx import Document
        from docx.shared import Pt
        from io import BytesIO

        doc = Document()
        doc.add_heading(title, level=0)
        for act in acts:
            doc.add_heading(f"Act: {act['title']}", level=1)
            for ch in act.get("chapters", []):
                doc.add_heading(ch["title"], level=2)
                for sc in ch.get("scenes", []):
                    text = _pm_json_to_plain_text(sc.get("content", "{}"))
                    for line in text.split("\n"):
                        line = line.strip()
                        if line:
                            p = doc.add_paragraph(line)
                            for run in p.runs:
                                run.font.size = Pt(12)
        buf = BytesIO()
        doc.save(buf)
        buf_data = buf.getvalue()
        return StreamingResponse(
            iter([buf_data]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={safe_title}.docx"},
        )

    else:  # txt
        parts = [f"{title}\n{'=' * len(title)}\n\n"]
        for act in acts:
            parts.append(f"Act: {act['title']}\n\n")
            for ch in act.get("chapters", []):
                parts.append(f"  {ch['title']}\n  {'-' * 20}\n\n")
                for sc in ch.get("scenes", []):
                    parts.append(_pm_json_to_plain_text(sc.get("content", "{}")))
                    parts.append("\n\n")
        return PlainTextResponse("".join(parts), media_type="text/plain",
                                 headers={"Content-Disposition": f"attachment; filename={safe_title}.txt"})


# ── Manuscript (bulk) ──

@router.get("/projects/{project_id}/manuscript")
async def api_get_manuscript(project_id: str):
    return await asyncio.to_thread(get_manuscript, project_id)


@router.get("/projects/{project_id}/manuscript-flat")
async def api_get_manuscript_flat(project_id: str):
    return await asyncio.to_thread(get_manuscript_flat, project_id)


# ── Migration ──

@router.get("/system/migration-status")
async def api_migration_status():
    return {"needs_migration": await asyncio.to_thread(needs_migration)}


@router.post("/system/run-migration")
async def api_run_migration():
    try:
        result = await asyncio.to_thread(run_migration)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
