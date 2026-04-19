"""
Skills 管理 API 接口

复用 WorldBook 的 RESTful 模式
"""
import time
import random
import string
from fastapi import APIRouter, HTTPException

from lumen.types.skills import SkillCreateRequest, SkillUpdateRequest
from lumen.prompt.skill_store import (
    list_skills,
    load_skill,
    create_skill,
    update_skill,
    delete_skill,
)

router = APIRouter()


def _generate_skill_id() -> str:
    """生成唯一的 Skill ID

    格式：skill{时间戳后6位}{3位随机字符}
    """
    timestamp = str(int(time.time()))[-6:]
    random_chars = ''.join(random.choices(string.ascii_lowercase, k=3))
    return f"skill{timestamp}{random_chars}"


@router.get("/list")
async def api_list_skills():
    """获取 Skill 列表"""
    return list_skills()


@router.post("/create")
async def api_create_skill(req: SkillCreateRequest):
    """创建 Skill"""
    skill_id = req.id or _generate_skill_id()

    try:
        data = req.model_dump()
        data.pop("id", None)
        return create_skill(skill_id, data)
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"Skill 已存在: {skill_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{skill_id}")
async def api_get_skill(skill_id: str):
    """获取单个 Skill 详情"""
    try:
        return load_skill(skill_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")


@router.put("/{skill_id}")
async def api_update_skill(skill_id: str, req: SkillUpdateRequest):
    """更新 Skill（部分更新）"""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    try:
        return update_skill(skill_id, updates)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{skill_id}")
async def api_delete_skill(skill_id: str):
    """删除 Skill"""
    try:
        delete_skill(skill_id)
        return {"message": f"已删除 Skill: {skill_id}"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")
