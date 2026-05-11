"""
TDB 条目浏览 API（通用，支持任意 TDB）

GET  /tdb/{name}/entries         — 列出条目（?source=&category=&limit=50&offset=0）
GET  /tdb/{name}/stats           — 条目统计
GET  /tdb/{name}/file-tree       — 源文件目录树
POST /tdb/{name}/import-file     — 从磁盘导入文件
"""

import os
import logging
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _get_tdb(name: str):
    """根据名称获取 TDB 实例（动态发现，无需白名单）"""
    from lumen.services.tdb_registry import get_tdb, is_user_tdb
    if not is_user_tdb(name):
        raise HTTPException(404, f"不可用的 TDB: {name}")
    return get_tdb(name)


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
        # TQL FIND 不允许空 filter {}，用 all_node_ids + get_payload 逐条读取
        node_ids = db.all_node_ids()
        entries = []
        for nid in node_ids:
            try:
                payload = db.get_payload(nid)
            except Exception:
                continue
            if not payload:
                continue
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
                "id": nid,
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
                payload = db.get_payload(nid)
            except Exception:
                continue
            if not payload:
                continue
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


@router.get("/{name}/file-tree")
async def file_tree(name: str):
    """返回 TDB 数据目录的文件树

    - knowledge: 从 TDB entry 的 source_path 反推文件夹结构
    - memory: 遍历文件系统 data/{name}/

    返回格式：{ folders: [{ name, path, files: [{ name, path }] }], total_files }
    """
    # 验证 TDB 可用（动态发现）
    _get_tdb(name)

    if name == "knowledge":
        return _file_tree_from_tdb(name)

    # memory: 文件系统遍历
    data_dir = os.path.join(_PROJECT_ROOT, "lumen", "data", name)
    if not os.path.isdir(data_dir):
        return {"folders": [], "total_files": 0}

    ALLOWED_EXT = {".md", ".txt", ".markdown"}
    folders = []
    total_files = 0

    for dirpath, dirnames, filenames in os.walk(data_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        matched_files = []
        for f in sorted(filenames):
            ext = os.path.splitext(f)[1].lower()
            if ext in ALLOWED_EXT:
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, data_dir).replace("\\", "/")
                matched_files.append({"name": f, "path": rel_path})
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


def _file_tree_from_tdb(name: str):
    """从 TDB entry 的 source_path 反推文件夹树（知识库无独立源文件目录时使用）"""
    db = _get_tdb(name)
    dir_files: dict[str, list[dict]] = defaultdict(list)

    for nid in db.all_node_ids():
        try:
            payload = db.get_payload(nid)
        except Exception:
            continue
        if not payload:
            continue
        sp = payload.get("source_path", "").replace("\\", "/").strip("/")
        if not sp:
            continue

        parts = sp.split("/")
        if len(parts) == 1:
            dir_files[""].append({"name": parts[0], "path": parts[0]})
        else:
            dir_path = "/".join(parts[:-1])
            file_name = parts[-1]
            dir_files[dir_path].append({"name": file_name, "path": sp})

    # 收集所有叶子目录和它们的父目录链
    all_dirs: dict[str, dict] = {}  # path → {name, files}
    for dir_path, files in dir_files.items():
        if not dir_path:
            all_dirs[""] = {"name": name, "files": files}
        else:
            segments = dir_path.split("/")
            for i in range(len(segments)):
                prefix = "/".join(segments[:i + 1])
                if prefix not in all_dirs:
                    all_dirs[prefix] = {
                        "name": segments[i],
                        "files": files if prefix == dir_path else [],
                    }
                elif prefix == dir_path:
                    all_dirs[prefix]["files"].extend(files)

    # 去重文件
    for d in all_dirs.values():
        seen = set()
        unique = []
        for f in d["files"]:
            if f["path"] not in seen:
                seen.add(f["path"])
                unique.append(f)
        d["files"] = sorted(unique, key=lambda x: x["name"])

    folders = [
        {"name": v["name"], "path": k, "files": v["files"]}
        for k, v in sorted(all_dirs.items())
    ]
    total_files = sum(len(f["files"]) for f in folders)

    return {"folders": folders, "total_files": total_files}


class ImportFileRequest(BaseModel):
    path: str  # 相对于 data/{name}/ 的文件路径


@router.post("/{name}/import-file")
async def import_file_from_disk(name: str, req: ImportFileRequest):
    """从磁盘读取文件并导入到 TDB（向量化）"""
    # 验证 TDB 可用（动态发现）
    _get_tdb(name)

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
        result = await _import_or_reimport(name, req.path, filename, content, category, parts)
        return result
    else:
        raise HTTPException(400, f"TDB {name} 暂不支持文件导入")


async def _import_or_reimport(
    name: str,
    req_path: str,
    filename: str,
    content: str,
    category: str,
    parts: list,
):
    """导入或重新导入：已存在则先清旧数据再重导（幂等）"""
    db = _get_tdb(name)

    # 查找已有的同 source_path 条目
    old_file_ids = set()
    old_node_ids = []
    for nid in db.all_node_ids():
        try:
            payload = db.get_payload(nid)
        except Exception:
            continue
        if not payload:
            continue
        sp = payload.get("source_path", "")
        if sp.endswith(req_path) or sp == req_path:
            old_node_ids.append(nid)
            fid = payload.get("file_id", "")
            if fid:
                old_file_ids.add(fid)

    # 清理旧 TDB chunks
    for nid in old_node_ids:
        try:
            db.delete(nid)
        except Exception:
            pass
    if old_node_ids:
        db.flush()

    # 清理旧 BM25 索引
    for fid in old_file_ids:
        try:
            from lumen.services.knowledge.chunks import delete_knowledge_chunks
            delete_knowledge_chunks(fid)
        except Exception:
            pass

    # 清理旧 registry 条目
    if old_file_ids:
        try:
            from lumen.services.knowledge import _load_registry, _save_registry
            registry = _load_registry()
            for fid in old_file_ids:
                registry.pop(fid, None)
            _save_registry(registry)
        except Exception:
            pass

    # 正式导入
    from lumen.services.knowledge import import_file as knowledge_import
    subdir = "/".join(parts[1:-1]) if len(parts) > 2 else ""
    meta = await knowledge_import(filename, content, category=category, subdir=subdir, source="manual")

    return {
        "success": True,
        "file_id": meta.get("id"),
        "chunks": meta.get("chunk_count", 0),
        "reimported": bool(old_file_ids),
    }
