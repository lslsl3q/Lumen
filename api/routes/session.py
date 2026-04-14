"""
会话管理 API 接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# 导入核心逻辑
from lumen.chat import load, reset, current_session_id
from lumen import history


# ========================================
# 请求/响应模型定义
# ========================================

class NewSessionResponse(BaseModel):
    """新会话响应"""
    session_id: str
    message: str


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
        新会话的 ID
    """
    try:
        # 加载角色，创建新会话
        load(character_id, session_id=None)

        return NewSessionResponse(
            session_id=current_session_id,
            message=f"已创建新会话，使用角色：{character_id}"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建会话失败: {str(e)}")


@router.post("/load")
async def load_session(session_id: str) -> dict:
    """
    加载指定会话

    Args:
        session_id: 会话ID

    Returns:
        加载结果
    """
    try:
        # 使用默认角色加载会话
        load("default", session_id=session_id)

        return {
            "message": f"已加载会话：{session_id}",
            "session_id": session_id
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


@router.delete("/delete")
async def delete_session(session_id: str) -> dict:
    """
    删除指定会话

    Args:
        session_id: 会话ID

    Returns:
        删除结果
    """
    try:
        history.delete_session(session_id)

        return {"message": f"已删除会话：{session_id}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除会话失败: {str(e)}")


@router.post("/reset")
async def reset_current() -> dict:
    """
    重置当前会话（清空聊天历史，创建新会话）

    Returns:
        重置结果
    """
    try:
        reset()

        return {
            "message": "已重置会话",
            "session_id": current_session_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重置会话失败: {str(e)}")
