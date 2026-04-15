"""
角色管理 API 接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# 导入核心逻辑
from lumen.prompt.character import load_character, list_characters
from lumen.prompt.builder import build_system_prompt
from lumen.core.session import get_session_manager


# ========================================
# 请求/响应模型定义
# ========================================

class CharacterInfo(BaseModel):
    """角色信息"""
    id: str
    name: str
    description: Optional[str] = None
    greeting: Optional[str] = None
    system_prompt: Optional[str] = None


class SwitchCharacterResponse(BaseModel):
    """切换角色响应"""
    message: str
    character_id: str
    session_id: str


class SwitchCharacterRequest(BaseModel):
    """切换角色请求"""
    character_id: str
    session_id: str = "default"


# ========================================
# API 端点
# ========================================

@router.get("/list")
async def get_characters() -> List[dict]:
    """
    获取所有可用角色列表

    Returns:
        角色列表，每项包含 (display_name, id)
    """
    try:
        chars = list_characters()

        return [
            {
                "id": char_id,
                "name": name,
                "display_name": name  # 前端显示的名称
            }
            for name, char_id in chars
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取角色列表失败: {str(e)}")


@router.get("/{character_id}")
async def get_character(character_id: str) -> CharacterInfo:
    """
    获取指定角色的详细信息

    Args:
        character_id: 角色 ID

    Returns:
        角色详细信息
    """
    try:
        char = load_character(character_id)

        return CharacterInfo(
            id=character_id,
            name=char.get("name", "未知角色"),
            description=char.get("description"),
            greeting=char.get("greeting"),
            system_prompt=char.get("system_prompt")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取角色信息失败: {str(e)}")


@router.post("/switch")
async def switch_character(req: SwitchCharacterRequest) -> SwitchCharacterResponse:
    """
    切换角色

    Args:
        req: 包含 character_id 和 session_id 的请求体

    Returns:
        切换结果
    """
    try:
        manager = get_session_manager()
        session = manager.get(req.session_id)

        if not session:
            # 会话不存在，创建新会话
            session = manager.create_new(req.character_id)
        else:
            # 会话存在，切换角色
            session.switch_character(req.character_id)

        return SwitchCharacterResponse(
            message=f"已切换到角色：{req.character_id}",
            character_id=req.character_id,
            session_id=session.session_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"切换角色失败: {str(e)}")
