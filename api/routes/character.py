"""
角色管理 API 接口
"""

import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict

router = APIRouter()

# 导入核心逻辑
from lumen.prompt.character import load_character, list_characters
from lumen.services.character import (
    create_character, update_character, delete_character, save_avatar
)


# ========================================
# 请求/响应模型定义
# ========================================

class CharacterInfo(BaseModel):
    """角色信息 — 与 CharacterCard 字段对齐"""
    id: str
    name: str
    description: Optional[str] = None
    greeting: Optional[str] = None
    system_prompt: Optional[str] = None
    avatar: Optional[str] = None
    tools: List[str] = []
    tool_tips: Optional[Dict[str, str]] = None
    model: Optional[str] = None
    context_size: Optional[int] = None
    auto_compact: bool = False
    compact_threshold: float = 0.7
    memory_enabled: bool = True
    memory_token_budget: int = 300
    memory_auto_summarize: bool = False
    knowledge_enabled: bool = True
    knowledge_semantic_routing: bool = True
    knowledge_top_k: int = 3
    knowledge_min_score: float = 0.3
    knowledge_token_budget: int = 500
    skills: List[str] = []
    response_style: Optional[str] = "balanced"
    accessible_knowledge: List[str] = []
    thinking: Optional[dict] = None


# ========================================
# API 端点
# ========================================

@router.get("/list")
async def get_characters() -> List[dict]:
    """
    获取所有可用角色列表

    Returns:
        角色列表，每项包含 id、name、avatar
    """
    try:
        chars = list_characters()

        # 补充头像信息
        result = []
        for char_summary in chars:
            try:
                full = load_character(char_summary["id"])
                result.append({
                    "id": char_summary["id"],
                    "name": char_summary["name"],
                    "display_name": char_summary["name"],
                    "avatar": full.get("avatar"),
                    "description": full.get("description"),
                    "tools": full.get("tools", []),
                })
            except Exception:
                # 加载详情失败，用基本信息兜底
                result.append({
                    "id": char_summary["id"],
                    "name": char_summary["name"],
                    "display_name": char_summary["name"],
                })

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取角色列表失败: {str(e)}")


@router.get("/{character_id}")
async def get_character(character_id: str) -> CharacterInfo:
    """
    获取指定角色的详细信息
    """
    try:
        char = load_character(character_id)

        return CharacterInfo(
            id=character_id,
            name=char.get("name", "未知角色"),
            description=char.get("description"),
            greeting=char.get("greeting"),
            system_prompt=char.get("system_prompt"),
            avatar=char.get("avatar"),
            tools=char.get("tools", []),
            tool_tips=char.get("tool_tips"),
            model=char.get("model"),
            context_size=char.get("context_size"),
            auto_compact=char.get("auto_compact", False),
            compact_threshold=char.get("compact_threshold", 0.7),
            memory_enabled=char.get("memory_enabled", True),
            memory_token_budget=char.get("memory_token_budget", 300),
            memory_auto_summarize=char.get("memory_auto_summarize", False),
            knowledge_enabled=char.get("knowledge_enabled", True),
            knowledge_semantic_routing=char.get("knowledge_semantic_routing", True),
            knowledge_top_k=char.get("knowledge_top_k", 3),
            knowledge_min_score=char.get("knowledge_min_score", 0.3),
            knowledge_token_budget=char.get("knowledge_token_budget", 500),
            skills=char.get("skills", []),
            response_style=char.get("response_style", "balanced"),
            accessible_knowledge=char.get("accessible_knowledge", []),
        )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"角色不存在: {character_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取角色信息失败: {str(e)}")


@router.post("/create")
async def api_create_character(
    character_id: Optional[str] = Form(None),  # 改为可选，未提供时自动生成
    data: str = Form(...),  # JSON 字符串，包含角色字段
    avatar: Optional[UploadFile] = File(None),
) -> dict:
    """
    创建新角色

    接收 multipart/form-data：可选 character_id + data(JSON) + 可选头像文件
    如果未提供 character_id，将自动生成唯一 ID
    """
    try:
        # 解析角色数据
        char_data = json.loads(data)

        # 如果没有提供 ID，先生成一个
        final_id = character_id
        if final_id is None:
            from lumen.services.character import _generate_character_id
            final_id = _generate_character_id()

        # 处理头像上传
        if avatar:
            file_data = await avatar.read()
            avatar_filename = save_avatar(final_id, avatar.filename, file_data)
            char_data["avatar"] = avatar_filename

        result = create_character(final_id, char_data)
        return {"message": f"角色 {final_id} 创建成功", "character": result}

    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建角色失败: {str(e)}")


@router.put("/{character_id}")
async def api_update_character(
    character_id: str,
    data: str = Form(...),  # JSON 字符串，包含要更新的字段
    avatar: Optional[UploadFile] = File(None),
) -> dict:
    """
    更新已有角色

    接收 multipart/form-data：data(JSON) + 可选头像文件
    只更新 data 中包含的字段，不覆盖未提交的字段
    """
    try:
        updates = json.loads(data)

        # 处理头像上传
        if avatar:
            file_data = await avatar.read()
            avatar_filename = save_avatar(character_id, avatar.filename, file_data)
            updates["avatar"] = avatar_filename

        result = update_character(character_id, updates)
        return {"message": f"角色 {character_id} 更新成功", "character": result}

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新角色失败: {str(e)}")


@router.delete("/{character_id}")
async def api_delete_character(character_id: str) -> dict:
    """
    删除角色（禁止删除 default）
    """
    try:
        delete_character(character_id)
        return {"message": f"角色 {character_id} 已删除"}

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除角色失败: {str(e)}")


@router.post("/upload-avatar")
async def api_upload_avatar(
    character_id: str = Form(...),
    avatar: UploadFile = File(...),
) -> dict:
    """
    单独上传/更新角色头像
    """
    try:
        file_data = await avatar.read()
        avatar_filename = save_avatar(character_id, avatar.filename, file_data)

        # 同时更新角色 JSON 中的 avatar 字段
        update_character(character_id, {"avatar": avatar_filename})

        return {"message": "头像上传成功", "avatar": avatar_filename}

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"头像上传失败: {str(e)}")
