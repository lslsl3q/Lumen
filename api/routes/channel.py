"""
Channel REST API（T26: Session→Channel 迁移）

提供频道的 CRUD 和消息查询，供前端频道列表和断线重连补拉使用。
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumen.services.storage.history import (
    list_channels, create_channel, delete_channel,
    get_channel_messages,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── 请求模型 ──

class CreateChannelRequest(BaseModel):
    name: str
    type: str = "chat"
    description: str = ""
    group: str = "base"


# ── 频道 CRUD ──

@router.get("/channels")
async def api_list_channels():
    """列出所有频道"""
    try:
        return list_channels()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/channels")
async def api_create_channel(req: CreateChannelRequest):
    """创建新频道"""
    try:
        channel_id = create_channel(
            name=req.name, channel_type=req.type,
            description=req.description, group_name=req.group,
        )
        return {"channel_id": channel_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/channels/{channel_id}")
async def api_delete_channel(channel_id: str):
    """删除频道"""
    try:
        if not delete_channel(channel_id):
            raise HTTPException(status_code=404, detail="频道不存在")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/channels/{channel_id}/messages")
async def api_channel_messages(channel_id: str, limit: int = 50, since_id: int = 0):
    """获取频道消息（支持 since_id 断线补拉）"""
    try:
        return get_channel_messages(channel_id, limit=limit, since_id=since_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
