"""
缓冲区管理 API

GET    /buffer/stats        — 统计
GET    /buffer/items         — 列出（?status=pending&limit=50）
GET    /buffer/search        — 搜索（?q=xxx&top_k=5）
POST   /buffer/consolidate   — 批量整理（可选 body: {ids: [...]})
POST   /buffer/confirm/:id   — 确认单条
PUT    /buffer/items/:id      — 更新内容（保存编辑，不影响审批状态）
DELETE /buffer/items/:id      — 丢弃
POST   /buffer/cleanup        — 清理已确认/已丢弃的条目
"""
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from lumen.services.buffer import (
    is_enabled, get_stats, list_items, search,
    consolidate, confirm_single, discard, cleanup, update_content,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class ConsolidateRequest(BaseModel):
    ids: list[int] | None = None


@router.get("/stats")
async def api_buffer_stats():
    """缓冲区统计"""
    if not is_enabled():
        return {"enabled": False, "message": "缓冲区未启用 (BUFFER_ENABLED=false)"}
    return get_stats()


@router.get("/items")
async def api_buffer_list(
    status: str = Query("pending", description="pending / confirmed / discarded"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    character_id: str = Query("", description="按角色过滤"),
):
    """列出缓冲区条目"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    return {"items": list_items(status, limit, offset, character_id)}


@router.get("/search")
async def api_buffer_search(
    q: str = Query(..., min_length=1, description="搜索查询"),
    top_k: int = Query(5, ge=1, le=20),
    character_id: str = Query("", description="按角色过滤"),
):
    """搜索缓冲区"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    results = await search(q, top_k=top_k, character_id=character_id)
    return {"query": q, "results": results, "total": len(results)}


@router.post("/consolidate")
async def api_buffer_consolidate(req: ConsolidateRequest = None):
    """批量整理缓冲区（小模型向量 → 大模型向量，写入正式库）"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    ids = req.ids if req else None
    result = await consolidate(ids)
    return result


@router.post("/confirm/{node_id}")
async def api_buffer_confirm(node_id: int):
    """确认单条（大模型重算向量后写入目标 TDB）"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    ok = await confirm_single(node_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"确认失败: 节点 {node_id} 不存在或嵌入失败")
    return {"message": f"已确认: {node_id}"}


@router.delete("/items/{node_id}")
async def api_buffer_discard(node_id: int):
    """丢弃一条缓冲区记录"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    ok = discard(node_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"丢弃失败: 节点 {node_id} 不存在")
    return {"message": f"已丢弃: {node_id}"}


@router.post("/cleanup")
async def api_buffer_cleanup():
    """清理已确认/已丢弃的条目（释放小模型向量空间）"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    count = cleanup()
    return {"message": f"已清理 {count} 条", "count": count}


class UpdateContentRequest(BaseModel):
    content: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    importance: int | None = None


@router.put("/items/{node_id}")
async def api_buffer_update(node_id: int, req: UpdateContentRequest):
    """更新缓冲区条目内容（保存编辑，不影响审批状态）"""
    if not is_enabled():
        raise HTTPException(status_code=400, detail="缓冲区未启用")
    ok = update_content(
        node_id,
        content=req.content,
        category=req.category,
        tags=req.tags,
        importance=req.importance,
    )
    if not ok:
        raise HTTPException(status_code=404, detail=f"更新失败: 节点 {node_id} 不存在")
    return {"message": f"已更新: {node_id}"}
