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
