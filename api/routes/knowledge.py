"""
知识库管理 API 接口
上传文件 → 自动切分向量化 → 语义搜索
"""
import os
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional

from lumen.types.knowledge import KnowledgeCreateRequest, KnowledgeSearchRequest
from lumen.services import knowledge as knowledge_store

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_EXTENSIONS = {".txt", ".md", ".markdown"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB


@router.get("/list")
async def api_list_files(category: Optional[str] = None):
    """列出所有已导入的知识库文件"""
    return knowledge_store.list_files(category=category)


@router.get("/{file_id}")
async def api_get_file(file_id: str):
    """获取单个知识库文件元数据"""
    try:
        return knowledge_store.get_file(file_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {file_id}")


@router.post("/upload")
async def api_upload_file(
    file: UploadFile = File(..., description="文本文件（.txt 或 .md）"),
    category: str = Form("imports"),
    subdir: str = Form(""),
):
    """上传文件并自动切分向量化"""
    filename = file.filename or "untitled.txt"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的格式: {ext}。支持 {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content_bytes = await file.read()
    if len(content_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="文件过大（最大 10MB）")

    # 编码检测
    try:
        text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content_bytes.decode("gbk")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="无法解码文件（需要 UTF-8 或 GBK）")

    # 路径安全检查
    if ".." in subdir or subdir.startswith("/"):
        raise HTTPException(status_code=400, detail="非法子目录路径")

    try:
        meta = await knowledge_store.import_file(filename, text, category=category, subdir=subdir, source="upload")
        return meta
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/create")
async def api_create_entry(req: KnowledgeCreateRequest):
    """直接通过文本内容创建知识库条目"""
    try:
        meta = await knowledge_store.import_file(
            req.filename, req.content, category=req.category, subdir=req.subdir,
        )
        return meta
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/search")
async def api_search(req: KnowledgeSearchRequest):
    """语义搜索知识库"""
    results = await knowledge_store.search(
        req.query, top_k=req.top_k, min_score=req.min_score, category=req.category,
    )
    return {"query": req.query, "results": results, "total": len(results)}


@router.delete("/{file_id}")
async def api_delete_file(file_id: str):
    """删除知识库文件及其所有向量"""
    try:
        await knowledge_store.delete_file(file_id)
        return {"message": f"已删除知识库文件: {file_id}"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {file_id}")


# ── T23 动态知识库：扫描 / 知识库 CRUD / 图谱同步 ──────────────────


@router.get("/scan")
async def scan_knowledge():
    """扫描所有知识库，返回变更（新增/修改/删除的文件）"""
    from lumen.services.knowledge_scanner import scan_knowledge_lib

    return scan_knowledge_lib()


@router.post("/scan/apply")
async def apply_scan_changes(changes: dict):
    """确认处理扫描变更。
    Body: {"register_kbs": ["跑团世界"], "reindex": ["file_id_1", "file_id_2"], "delete": ["file_id_3"]}
    """
    from lumen.services.manifest import ensure_manifest_for_existing_kb

    results = {"registered": [], "reindexed": [], "deleted": []}

    # 注册新知识库
    for kb_name in changes.get("register_kbs", []):
        ensure_manifest_for_existing_kb(kb_name)
        results["registered"].append(kb_name)

    # 重新索引修改文件
    for file_id in changes.get("reindex", []):
        result = await knowledge_store.reindex_file(file_id)
        results["reindexed"].append(result)

    # 删除文件
    for file_id in changes.get("delete", []):
        await knowledge_store.delete_file(file_id)
        results["deleted"].append(file_id)

    return results


@router.get("/bases")
async def list_bases():
    """列出所有已注册的知识库"""
    from lumen.services.manifest import list_kbs

    return {"bases": list_kbs()}


@router.post("/bases")
async def create_base(body: dict):
    """创建新知识库"""
    from lumen.config import KNOWLEDGE_LIB_DIR
    from lumen.services.manifest import register_kb

    name = body.get("name", "").strip()
    if not name or name.startswith("_"):
        raise HTTPException(status_code=400, detail="无效的知识库名称")

    kb_dir = os.path.join(KNOWLEDGE_LIB_DIR, name)
    if os.path.exists(kb_dir):
        raise HTTPException(status_code=409, detail=f"知识库 '{name}' 已存在")

    os.makedirs(kb_dir, exist_ok=True)
    entry = register_kb(
        name,
        tdb_path=f"data/vectors/api/kb_{name}.tdb",
        graph_path=f"data/graphs/kb_{name}.tdb",
        sentence_path=f"data/vectors/local/knowledge_sentences_{name}.tdb",
    )
    return entry


@router.delete("/bases/{name}")
async def delete_base(name: str):
    """删除知识库（文件夹 + 注册信息）"""
    import shutil
    from lumen.config import KNOWLEDGE_LIB_DIR
    from lumen.services.manifest import unregister_kb

    kb_dir = os.path.join(KNOWLEDGE_LIB_DIR, name)
    if not os.path.exists(kb_dir):
        raise HTTPException(status_code=404, detail="知识库不存在")

    shutil.rmtree(kb_dir)
    unregister_kb(name)
    return {"deleted": name}


@router.post("/graph/sync")
async def sync_graph(body: dict = None):
    """同步图谱：对脏文件执行图谱抽取"""
    from lumen.services.knowledge_scanner import get_dirty_files, update_registry_entry
    from lumen.services.graph_extract import extract_and_store
    from lumen.config import KNOWLEDGE_LIB_DIR
    from lumen.services.knowledge import _read_file_content

    kb_name = (body or {}).get("kb")
    dirty = get_dirty_files(kb_name)

    synced = []
    for item in dirty:
        kb = item["kb"]
        file_id = item["file_id"]
        source_path = item.get("source_path", "")
        full_path = os.path.join(KNOWLEDGE_LIB_DIR, kb, source_path)

        if not os.path.exists(full_path):
            continue

        content = _read_file_content(full_path)
        if content:
            await extract_and_store(content, tdb_name="knowledge",
                                    source_episode_id=file_id)
            update_registry_entry(kb, file_id, graph_sync_needed=False)
            synced.append(file_id)

    return {"synced": synced, "count": len(synced)}
