"""
日记/主动记忆管理 API

路由按资源分组，各有独立路径前缀，避免路径参数和固定路径冲突：
  /items/*   — 主动记忆 CRUD（结构化记忆条目）
  /files/*   — 文件树浏览、文件读写
  /folders/* — 文件夹管理（新建、删除、在资源管理器中打开）
"""
import os
import logging
import subprocess
import sys

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumen.services import history
from lumen.config import DAILY_NOTE_DIR

logger = logging.getLogger(__name__)

router = APIRouter()


# ── 请求模型 ──

class MemorySearchRequest(BaseModel):
    query: str
    character_id: str = ""
    limit: int = 10


class FileContentRequest(BaseModel):
    path: str
    content: str


class FolderRequest(BaseModel):
    name: str


# ═══════════════════════════════════════
# 主动记忆 CRUD — /items/*
# ═══════════════════════════════════════

@router.get("/items")
async def api_list_memories(
    character_id: str = "",
    category: str = "",
    limit: int = 50,
):
    """列出所有主动记忆条目"""
    return history.list_active_memories(
        character_id=character_id, category=category, limit=limit,
    )


@router.post("/items/search")
async def api_search_memories(req: MemorySearchRequest):
    """BM25 关键词搜索主动记忆"""
    results = history.search_active_memories_bm25(
        req.query, character_id=req.character_id, limit=req.limit,
    )
    return {"query": req.query, "results": results, "total": len(results)}


@router.delete("/items/{memory_id}")
async def api_delete_memory(memory_id: str):
    """删除单条主动记忆（SQLite + FTS5 + 关联 MD 文件）"""
    memories = history.list_active_memories(limit=1000)
    target = next((m for m in memories if m["memory_id"] == memory_id), None)

    deleted = history.delete_active_memory(memory_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"记忆不存在: {memory_id}")

    if target and target.get("md_path"):
        md_file = os.path.join(DAILY_NOTE_DIR, "active", target["md_path"])
        if os.path.exists(md_file):
            os.remove(md_file)

    return {"message": f"已删除记忆: {memory_id}"}


# ═══════════════════════════════════════
# 文件管理 — /files/*
# ═══════════════════════════════════════

@router.get("/files")
async def api_list_files():
    """列出 daily_note/ 目录下的文件树"""
    if not os.path.exists(DAILY_NOTE_DIR):
        return {"folders": []}

    folders = []
    for entry in sorted(os.scandir(DAILY_NOTE_DIR), key=lambda e: e.name):
        if not entry.is_dir():
            continue
        files = []
        for f in sorted(os.scandir(entry.path), key=lambda e: e.name):
            if f.is_file() and f.name.endswith(".md"):
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "size": stat.st_size,
                    "modified": os.path.getmtime(f.path),
                })
        folders.append({
            "name": entry.name,
            "path": entry.name,
            "files": files,
        })
    return {"folders": folders}


@router.get("/files/content")
async def api_read_file(path: str):
    """读取指定 MD 文件内容"""
    if ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="非法路径")

    full_path = os.path.join(DAILY_NOTE_DIR, path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")


@router.put("/files/content")
async def api_save_file(req: FileContentRequest):
    """保存/更新 MD 文件内容"""
    if ".." in req.path or req.path.startswith("/"):
        raise HTTPException(status_code=400, detail="非法路径")

    full_path = os.path.join(DAILY_NOTE_DIR, req.path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    try:
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"message": f"已保存: {req.path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {e}")


# ═══════════════════════════════════════
# 文件夹管理 — /folders/*
# ═══════════════════════════════════════

@router.post("/folders")
async def api_create_folder(req: FolderRequest):
    """新建文件夹"""
    name = req.name.strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="文件夹名不合法")

    full_path = os.path.join(DAILY_NOTE_DIR, name)
    if os.path.exists(full_path):
        raise HTTPException(status_code=409, detail=f"文件夹已存在: {name}")

    os.makedirs(full_path, exist_ok=True)
    return {"message": f"已创建文件夹: {name}"}


@router.delete("/folders/{folder_name}")
async def api_delete_folder(folder_name: str):
    """删除空文件夹"""
    if ".." in folder_name or "/" in folder_name or "\\" in folder_name:
        raise HTTPException(status_code=400, detail="文件夹名不合法")

    full_path = os.path.join(DAILY_NOTE_DIR, folder_name)
    if not os.path.exists(full_path) or not os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail=f"文件夹不存在: {folder_name}")

    if os.listdir(full_path):
        raise HTTPException(status_code=409, detail="文件夹非空，请先删除其中的文件")

    os.rmdir(full_path)
    return {"message": f"已删除文件夹: {folder_name}"}


@router.post("/folders/open")
async def api_open_folder(req: FolderRequest):
    """在系统文件管理器中打开指定文件夹"""
    name = req.name.strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="文件夹名不合法")

    full_path = os.path.join(DAILY_NOTE_DIR, name)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail=f"文件夹不存在: {name}")

    try:
        if sys.platform == "win32":
            os.startfile(full_path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", full_path])
        else:
            subprocess.Popen(["xdg-open", full_path])
        return {"message": f"已打开: {name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开失败: {e}")
