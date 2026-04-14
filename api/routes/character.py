"""
角色管理 API 接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# 导入核心逻辑
from lumen.prompt import load_character, list_characters, build_system_prompt
from lumen.chat import load


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
async def switch_character(character_id: str, create_new_session: bool = True) -> SwitchCharacterResponse:
    """
    切换角色

    Args:
        character_id: 要切换到的角色 ID
        create_new_session: 是否创建新会话，默认 True

    Returns:
        切换结果
    """
    try:
        # 加载角色（会创建新会话）
        load(character_id, session_id=None if create_new_session else None)

        from lumen.chat import current_session_id

        return SwitchCharacterResponse(
            message=f"已切换到角色：{character_id}",
            character_id=character_id,
            session_id=current_session_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"切换角色失败: {str(e)}")
