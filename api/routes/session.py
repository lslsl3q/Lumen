"""
会话管理 API 接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# 导入核心逻辑
from lumen.core.session import get_session_manager
from lumen.services import history


# ========================================
# 请求/响应模型定义
# ========================================

class NewSessionResponse(BaseModel):
    """新会话响应"""
    session_id: str
    character_id: str
    message: str


class SessionRequest(BaseModel):
    """会话操作请求（加载/删除等）"""
    session_id: str


class SessionListItem(BaseModel):
    """会话列表项"""
    session_id: str
    character_id: str
    created_at: str
    message_count: int


# ========================================
# API 端点
# ========================================

@router.post("/new")
async def create_session(character_id: str = "default") -> NewSessionResponse:
    """
    创建新会话

    Args:
        character_id: 角色ID，默认为 default

    Returns:
        新会话的信息
    """
    try:
        manager = get_session_manager()
        session = manager.create_new(character_id)

        return NewSessionResponse(
            session_id=session.session_id,
            character_id=session.character_id,
            message=f"已创建新会话，使用角色：{character_id}"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建会话失败: {str(e)}")


@router.post("/load")
async def load_session(req: SessionRequest) -> dict:
    """
    加载指定会话

    Args:
        req: 包含 session_id 的请求体

    Returns:
        加载结果
    """
    try:
        manager = get_session_manager()
        session = manager.get_or_create(req.session_id)

        return {
            "message": f"已加载会话：{req.session_id}",
            "session_id": session.session_id,
            "character_id": session.character_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"加载会话失败: {str(e)}")


@router.get("/list")
async def list_sessions(limit: int = 20) -> List[SessionListItem]:
    """
    获取会话列表

    Args:
        limit: 最多返回多少条，默认 20

    Returns:
        会话列表
    """
    try:
        sessions = history.list_sessions(limit=limit)

        return [
            SessionListItem(
                session_id=s[0],
                character_id=s[1],
                created_at=s[2],
                message_count=0  # 暂时设置为0，以后可以查询消息数量
            )
            for s in sessions
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取会话列表失败: {str(e)}")


@router.delete("/{session_id}")
async def delete_session(session_id: str) -> dict:
    """
    删除指定会话

    Args:
        session_id: 会话ID（URL路径参数）

    Returns:
        删除结果
    """
    try:
        manager = get_session_manager()
        manager.remove(session_id)  # 从内存中移除
        history.delete_session(session_id)  # 从数据库中删除

        return {"message": f"已删除会话：{session_id}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除会话失败: {str(e)}")


@router.post("/reset")
async def reset_session(session_id: str = "default") -> dict:
    """
    重置指定会话（清空聊天历史，创建新会话）

    Args:
        session_id: 会话ID，默认为 "default"

    Returns:
        重置结果
    """
    try:
        manager = get_session_manager()
        session = manager.get(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        session.reset()

        return {
            "message": "已重置会话",
            "session_id": session.session_id,
            "character_id": session.character_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重置会话失败: {str(e)}")
