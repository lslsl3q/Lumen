"""
T11 写作模式 REST API — 作品/章节/世界观设定 CRUD
"""

import asyncio
import logging
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from lumen.services.storage.writing import (
    create_project, list_projects, get_project, update_project, delete_project,
    create_chapter, list_chapters, get_chapter, update_chapter, delete_chapter, reorder_chapters,
    create_setting, list_settings, get_setting, update_setting, delete_setting, reorder_settings,
)
from lumen.services.storage.writing_snapshot import (
    create_snapshot, list_snapshots, get_snapshot_detail, restore_snapshot, delete_snapshot,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── 请求模型 ──

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

def _safe_filename(name: str) -> str:
    """清理文件名：去除路径分隔符、换行、控制字符"""
    return re.sub(r'[/\\:\n\r\t\0]', '_', name).strip('. ')


def _md_to_plain_text(content: str) -> str:
    """Markdown 转纯文本：保留用户分割符（6+连续符号独占一行），段落加全角空格缩进。"""
    lines = content.split("\n")
    result = []
    for line in lines:
        stripped = line.strip()
        # 分割符：独占一行 + 6个以上连续符号 → 原样保留
        if re.match(r'^[-=_*·※]{6,}\s*$', stripped):
            result.append("")
            result.append(stripped)
            result.append("")
            continue
        # 去标题标记
        stripped = re.sub(r'^#{1,6}\s*', '', stripped)
        # 去粗体/斜体（注意不匹配分割符）
        stripped = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', stripped)
        stripped = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', stripped)
        # 去行内代码
        stripped = re.sub(r'`([^`]+)`', r'\1', stripped)
        # 去图片（必须在链接之前，否则 ! 被 link 正则吃掉）
        stripped = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', stripped)
        # 去链接保留文本
        stripped = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', stripped)
        # 去短分割线（3-5个连续 - 在行首）
        if re.match(r'^[-]{3,5}\s*$', stripped):
            continue
        # 非空行加全角空格缩进
        if stripped:
            stripped = "　　" + stripped
        result.append(stripped)
    # 清理连续空行（最多保留两个换行）
    text = "\n".join(result)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip()


def _generate_docx(title: str, chapters: list[dict]) -> bytes:
    """在同步线程中生成 DOCX 文件。"""
    from docx import Document
    from docx.shared import Pt
    from io import BytesIO

    doc = Document()
    doc.add_heading(title, level=0)

    for ch in chapters:
        vol = ch.get("volume", "")
        heading = f"{vol + ' · ' if vol else ''}{ch['title']}"
        doc.add_heading(heading, level=1)

        content = ch.get("content", "")
        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("### "):
                doc.add_heading(line[4:], level=3)
            elif line.startswith("## "):
                doc.add_heading(line[3:], level=2)
            elif line.startswith("# "):
                doc.add_heading(line[2:], level=1)
            elif re.match(r'^[-=_*·※]{6,}\s*$', line):
                continue  # 分割符在 DOCX 中跳过
            else:
                clean = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', line)
                clean = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', clean)
                clean = re.sub(r'`([^`]+)`', r'\1', clean)
                p = doc.add_paragraph(clean)
                for run in p.runs:
                    run.font.size = Pt(12)

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


@router.get("/projects/{project_id}/export")
async def api_export_project(project_id: str, format: str = "txt"):
    """导出整本作品为 TXT / Markdown / DOCX"""
    chapters = await asyncio.to_thread(list_chapters, project_id)
    if not chapters:
        raise HTTPException(404, "没有章节可导出")

    project = await asyncio.to_thread(get_project, project_id)
    title = project["name"] if project else "未命名"
    safe_title = _safe_filename(title)

    if format == "md":
        parts = [f"# {title}\n\n"]
        for ch in chapters:
            vol = ch.get("volume", "")
            parts.append(f"## {vol + ' · ' if vol else ''}{ch['title']}\n\n")
            parts.append(f"{ch.get('content', '')}\n\n---\n\n")
        return PlainTextResponse("".join(parts), media_type="text/markdown",
                                 headers={"Content-Disposition": f"attachment; filename={safe_title}.md"})

    elif format == "docx":
        buf_data = await asyncio.to_thread(_generate_docx, title, chapters)
        return StreamingResponse(
            iter([buf_data]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={safe_title}.docx"},
        )

    else:  # txt 默认
        parts = [f"{title}\n{'=' * len(title)}\n\n"]
        for ch in chapters:
            vol = ch.get("volume", "")
            parts.append(f"{vol + ' · ' if vol else ''}{ch['title']}\n{'-' * 20}\n\n")
            content = _md_to_plain_text(ch.get("content", ""))
            parts.append(f"{content}\n\n")
        return PlainTextResponse("".join(parts), media_type="text/plain",
                                 headers={"Content-Disposition": f"attachment; filename={safe_title}.txt"})
