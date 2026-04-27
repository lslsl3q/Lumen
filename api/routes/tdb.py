"""
TDB 条目浏览 API（通用，支持任意 TDB）

GET  /tdb/{name}/entries         — 列出条目（?source=&category=&limit=50&offset=0）
GET  /tdb/{name}/stats           — 条目统计
GET  /tdb/{name}/file-tree       — 源文件目录树
PUT  /tdb/{name}/entries/{id}    — 更新条目（payload + 可选重向量化）
DELETE /tdb/{name}/entries/{id}  — 删除条目
"""

import os
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED = {"knowledge", "memory", "buffer"}

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _get_tdb(name: str):
    """根据名称获取 TDB 实例"""
    if name not in _ALLOWED:
        raise HTTPException(404, f"未知 TDB: {name}，可用: {list(_ALLOWED)}")

    if name == "buffer":
        from lumen.services.buffer import _get_db
        db = _get_db()
        if not db:
            raise HTTPException(400, "缓冲区未初始化")
        return db
    elif name == "knowledge":
        from lumen.services.knowledge import _get_db
        return _get_db()
    elif name == "memory":
        from lumen.services.vector_store import _get_db
        return _get_db()


@router.get("/{name}/entries")
async def list_entries(
    name: str,
    source: str = Query("", description="按 source 过滤"),
    category: str = Query("", description="按 category 过滤"),
    status: str = Query("", description="按 status 过滤"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """列出 TDB 条目（payload 浏览）"""
    db = _get_tdb(name)
    try:
        # filter_where({}) 不可靠，用 all_node_ids + get 逐条读取
        node_ids = db.all_node_ids()
        entries = []
        for nid in node_ids:
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            # 跳过图谱实体（name+type 但无 content/source）
            if "name" in payload and "type" in payload and not payload.get("content"):
                continue
            # 过滤
            if source and payload.get("source") != source:
                continue
            if category and payload.get("category") != category:
                continue
            if status and payload.get("status") != status:
                continue

            entries.append({
                "id": node.id if hasattr(node, "id") else nid,
                "content": payload.get("content", "")[:500],
                "source": payload.get("source", ""),
                "category": payload.get("category", ""),
                "keywords": payload.get("keywords", []),
                "tags": payload.get("tags", []),
                "importance": payload.get("importance", 0),
                "status": payload.get("status", ""),
                "session_id": payload.get("session_id", ""),
                "character_id": payload.get("character_id", ""),
                "created_at": payload.get("created_at", ""),
                "role": payload.get("role", ""),
                "message_id": payload.get("message_id"),
                "source_path": payload.get("source_path", ""),
                "filename": payload.get("filename", ""),
            })

        # 按时间倒序
        entries.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        total = len(entries)
        return {"entries": entries[offset:offset + limit], "total": total}

    except Exception as e:
        raise HTTPException(500, f"查询条目失败: {e}")


@router.get("/{name}/stats")
async def tdb_stats(name: str):
    """TDB 条目统计"""
    db = _get_tdb(name)
    try:
        node_ids = db.all_node_ids()
        total = 0
        sources = {}
        categories = {}
        statuses = {}

        for nid in node_ids:
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            # 跳过图谱实体
            if "name" in payload and "type" in payload and not payload.get("content"):
                continue
            total += 1
            src = payload.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1
            cat = payload.get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1
            st = payload.get("status", "")
            if st:
                statuses[st] = statuses.get(st, 0) + 1

        return {"total": total, "sources": sources, "categories": categories, "statuses": statuses}

    except Exception as e:
        raise HTTPException(500, f"统计失败: {e}")


class TdbEntryUpdate(BaseModel):
    content: str | None = None
    source: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    importance: int | None = None
    reindex: bool = True  # 是否重算向量


@router.put("/{name}/entries/{entry_id}")
async def update_entry(name: str, entry_id: int, body: TdbEntryUpdate):
    """更新 TDB 条目 payload（可选重向量化）"""
    db = _get_tdb(name)
    try:
        node = db.get(entry_id)
        if not node:
            raise HTTPException(404, f"条目不存在: {entry_id}")

        payload = dict(node.payload) if hasattr(node, "payload") else {}

        # 更新 payload 字段
        if body.content is not None:
            payload["content"] = body.content
        if body.source is not None:
            payload["source"] = body.source
        if body.category is not None:
            payload["category"] = body.category
        if body.tags is not None:
            payload["tags"] = body.tags
        if body.importance is not None:
            payload["importance"] = body.importance

        # 内容变了且需要重向量化
        if body.reindex and body.content is not None and name in ("knowledge", "buffer"):
            service_map = {"knowledge": "knowledge", "buffer": "buffer"}
            from lumen.services.embedding import get_service
            backend = await get_service(service_map.get(name, name))
            if backend:
                new_vector = await backend.encode(body.content)
                if new_vector:
                    db.update_vector(entry_id, new_vector)
                    logger.info(f"TDB 条目 {entry_id} 已重向量化 ({name})")

        db.update_payload(entry_id, payload)
        db.flush()

        # 内容变更时同步写回源文件
        if body.content is not None and name == "knowledge":
            old_content = (node.payload if hasattr(node, "payload") else {}).get("content", "")
            source_path = payload.get("source_path", "")
            if old_content and body.content != old_content and source_path:
                try:
                    from lumen.config import KNOWLEDGE_SOURCE_DIR
                    file_path = os.path.join(KNOWLEDGE_SOURCE_DIR, source_path)
                    if os.path.isfile(file_path):
                        with open(file_path, "r", encoding="utf-8") as f:
                            file_content = f.read()
                        # 替换旧 chunk 内容为新内容
                        if old_content in file_content:
                            new_file_content = file_content.replace(old_content, body.content, 1)
                            with open(file_path, "w", encoding="utf-8") as f:
                                f.write(new_file_content)
                            logger.info(f"源文件已同步更新: {source_path}")
                        else:
                            logger.warning(f"源文件中未找到旧 chunk 内容，跳过同步: {source_path}")
                except Exception as e:
                    logger.warning(f"源文件同步失败: {source_path}: {e}")

        return {"id": entry_id, "updated": True}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"更新条目失败: {e}")


@router.delete("/{name}/entries/{entry_id}")
async def delete_entry(name: str, entry_id: int):
    """删除 TDB 条目"""
    db = _get_tdb(name)
    try:
        node = db.get(entry_id)
        if not node:
            raise HTTPException(404, f"条目不存在: {entry_id}")
        db.delete(entry_id)
        db.flush()
        return {"id": entry_id, "deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"删除条目失败: {e}")


@router.get("/{name}/file-tree")
async def file_tree(name: str):
    """返回 TDB 对应数据目录的文件树（用于源文件视图）

    返回格式：{ folders: [{ name, path, files: [{ name, path }] }] }
    只列出 .md / .txt / .markdown 文件。
    导入状态由前端根据已加载的条目 source_path 判断（不遍历 TDB）。
    """
    if name not in _ALLOWED:
        raise HTTPException(404, f"未知 TDB: {name}")

    # 数据目录：data/{name}/
    data_dir = os.path.join(_PROJECT_ROOT, "lumen", "data", name)
    if not os.path.isdir(data_dir):
        return {"folders": [], "total_files": 0}

    ALLOWED_EXT = {".md", ".txt", ".markdown"}
    folders = []
    total_files = 0

    for dirpath, dirnames, filenames in os.walk(data_dir):
        # 跳过隐藏目录
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]

        # 收集符合条件的文件
        matched_files = []
        for f in sorted(filenames):
            ext = os.path.splitext(f)[1].lower()
            if ext in ALLOWED_EXT:
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, data_dir).replace("\\", "/")
                matched_files.append({
                    "name": f,
                    "path": rel_path,
                })
                total_files += 1

        if matched_files:
            rel_dir = os.path.relpath(dirpath, data_dir).replace("\\", "/")
            if rel_dir == ".":
                rel_dir = ""
            folders.append({
                "name": os.path.basename(dirpath) if rel_dir else name,
                "path": rel_dir,
                "files": matched_files,
            })

    return {"folders": folders, "total_files": total_files}


class ImportFileRequest(BaseModel):
    path: str  # 相对于 data/{name}/ 的文件路径


@router.post("/{name}/import-file")
async def import_file_from_disk(name: str, req: ImportFileRequest):
    """从磁盘读取文件并导入到 TDB（向量化）"""
    if name not in _ALLOWED:
        raise HTTPException(404, f"未知 TDB: {name}")

    data_dir = os.path.join(_PROJECT_ROOT, "lumen", "data", name)
    full_path = os.path.normpath(os.path.join(data_dir, req.path))

    # 安全检查：防止路径穿越
    if not full_path.startswith(os.path.normpath(data_dir)):
        raise HTTPException(400, "非法路径")
    if not os.path.isfile(full_path):
        raise HTTPException(404, f"文件不存在: {req.path}")

    # 读取内容
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        raise HTTPException(400, f"读取文件失败: {e}")

    if not content.strip():
        raise HTTPException(400, "文件内容为空")

    # 解析路径结构：取父目录作为 category，文件名
    rel_path = req.path.replace("\\", "/")
    parts = rel_path.split("/")
    filename = parts[-1]
    # category 取源文件所在的最外层目录名，默认 "imports"
    category = parts[0] if len(parts) > 1 else "imports"

    # 调用 knowledge 导入
    if name == "knowledge":
        # 去重检查：已有同 source_path 的条目则拒绝重复导入
        db = _get_tdb(name)
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if payload.get("source_path", "").endswith(req.path) or payload.get("source_path") == req.path:
                raise HTTPException(409, f"该文件已在向量库中，如需重新导入请先删除旧条目")

        from lumen.services.knowledge import import_file
        subdir = "/".join(parts[1:-1]) if len(parts) > 2 else ""
        meta = await import_file(filename, content, category=category, subdir=subdir, source="manual")
        return {"success": True, "file_id": meta.get("id"), "chunks": meta.get("chunk_count", 0)}
    else:
        raise HTTPException(400, f"TDB {name} 暂不支持文件导入")
