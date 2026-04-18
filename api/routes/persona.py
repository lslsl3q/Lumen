"""
Persona 管理 API 接口
和角色系统一样的 CRUD + switch
"""

from fastapi import APIRouter, HTTPException

from lumen.types.persona import PersonaCreateRequest, PersonaUpdateRequest

router = APIRouter()

from lumen.prompt.persona import (
    list_personas, load_persona,
    create_persona, update_persona, delete_persona,
    get_active_persona_id, set_active_persona,
)
from lumen.core.session import get_session_manager


# ========================================
# 具体路径（必须在 {persona_id} 之前，否则被通配符拦截）
# ========================================

@router.get("/list")
async def api_list_personas():
    """获取 Persona 列表"""
    return list_personas()


@router.get("/active")
async def api_get_active_persona():
    """获取当前激活的 Persona"""
    persona_id = get_active_persona_id()
    if persona_id:
        try:
            persona = load_persona(persona_id)
            return {"persona_id": persona_id, "persona": persona}
        except FileNotFoundError:
            return {"persona_id": None, "persona": None}
    return {"persona_id": None, "persona": None}


@router.post("/create")
async def api_create_persona(req: PersonaCreateRequest):
    """创建新 Persona

    如果未提供 ID，将自动生成唯一 ID
    """
    try:
        persona = create_persona(req.id, {
            "name": req.name,
            "description": req.description,
            "traits": req.traits,
        })
        return persona
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"Persona 已存在: {req.id or 'auto-generated'}")


@router.post("/switch")
async def api_switch_persona(payload: dict):
    """切换激活的 Persona，同时刷新所有内存中会话的 system prompt"""
    persona_id = payload.get("persona_id")

    try:
        set_active_persona(persona_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Persona 不存在: {persona_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 刷新所有内存中会话的 system prompt
    manager = get_session_manager()
    for session_id, session in manager._sessions.items():
        session.reload_system_prompt()

    return {
        "message": f"已切换 Persona: {persona_id or '(无)'}",
        "active_persona_id": persona_id,
    }


# ========================================
# 通配路径 CRUD（放最后）
# ========================================

@router.get("/{persona_id}")
async def api_get_persona(persona_id: str):
    """获取单个 Persona 详情"""
    try:
        return load_persona(persona_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Persona 不存在: {persona_id}")


@router.put("/{persona_id}")
async def api_update_persona(persona_id: str, req: PersonaUpdateRequest):
    """更新 Persona（部分更新）"""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    try:
        return update_persona(persona_id, updates)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Persona 不存在: {persona_id}")


@router.delete("/{persona_id}")
async def api_delete_persona(persona_id: str):
    """删除 Persona（禁止删 default）"""
    try:
        delete_persona(persona_id)
        # 如果删除的是当前激活的，清空激活状态
        if get_active_persona_id() == persona_id:
            set_active_persona(None)
        return {"message": f"已删除 Persona: {persona_id}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Persona 不存在: {persona_id}")
