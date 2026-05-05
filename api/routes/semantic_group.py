"""
T26 语义组 REST API — CRUD + 重算向量
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumen.services import semantic_group as sg

logger = logging.getLogger(__name__)

router = APIRouter()


class CreateGroupRequest(BaseModel):
    group_id: str
    type: str
    name: str
    keywords: list[str]
    scope_db: str = "knowledge.tdb"
    scope_collection: str | None = None
    weight: float = 1.0
    metadata: dict | None = None


class UpdateKeywordsRequest(BaseModel):
    keywords: list[str]


@router.get("/semantic-groups")
async def api_list_groups(type: str = None):
    """列出语义组（可按 type 过滤）"""
    try:
        return sg.list_groups(type_=type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/semantic-groups/{group_id}")
async def api_get_group(group_id: str):
    """获取单个语义组"""
    g = sg.get_group(group_id)
    if not g:
        raise HTTPException(status_code=404, detail="语义组不存在")
    return g


@router.post("/semantic-groups")
async def api_create_group(req: CreateGroupRequest):
    """创建语义组（自动触发向量预计算）"""
    try:
        group_id = await sg.create_group(
            group_id=req.group_id,
            type_=req.type,
            name=req.name,
            keywords=req.keywords,
            scope_db=req.scope_db,
            scope_collection=req.scope_collection,
            weight=req.weight,
            metadata=req.metadata,
        )
        return {"group_id": group_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/semantic-groups/{group_id}/keywords")
async def api_update_keywords(group_id: str, req: UpdateKeywordsRequest):
    """更新语义组关键词（自动触发向量重算）"""
    try:
        ok = await sg.update_keywords(group_id, req.keywords)
        if not ok:
            raise HTTPException(status_code=404, detail="语义组不存在")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/semantic-groups/{group_id}")
async def api_delete_group(group_id: str):
    """删除语义组 + 清理向量文件"""
    try:
        ok = await sg.delete_group(group_id)
        if not ok:
            raise HTTPException(status_code=404, detail="语义组不存在")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/semantic-groups/{group_id}/recompute")
async def api_recompute_vector(group_id: str):
    """手动重算语义组向量"""
    try:
        vector_id = await sg.precompute_vector(group_id)
        if not vector_id:
            raise HTTPException(status_code=500, detail="向量计算失败")
        return {"vector_id": vector_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/semantic-groups/compute-scores")
async def api_compute_scores(query: str, group_type: str = "emotion"):
    """便捷端点：对文本计算情绪/语义组分数"""
    try:
        from lumen.services.embedding import get_service
        backend = await get_service("knowledge")
        vec = await backend.encode(query)
        if not vec:
            raise HTTPException(status_code=500, detail="嵌入计算失败")
        scores = await sg.compute_scores(vec, group_type)
        return {"scores": scores}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
