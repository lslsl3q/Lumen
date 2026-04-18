"""
世界书管理 API 接口

参考 Persona 和 Author's Note 的 RESTful 风格
"""
import time
import random
import string
from fastapi import APIRouter, HTTPException
from typing import List

from lumen.types.worldbook import WorldBookCreateRequest, WorldBookUpdateRequest
from lumen.prompt.worldbook_store import (
    list_worldbooks,
    load_worldbook,
    create_worldbook,
    update_worldbook,
    delete_worldbook,
)

router = APIRouter()


def _generate_worldbook_id() -> str:
    """生成唯一的世界书 ID

    格式：wb{时间戳后6位}{3位随机字符}
    例如：wb234567abc
    """
    timestamp = str(int(time.time()))[-6:]  # 时间戳后6位
    random_chars = ''.join(random.choices(string.ascii_lowercase, k=3))  # 3位小写字母
    return f"wb{timestamp}{random_chars}"


# 具体路径（必须在 {entry_id} 之前）

@router.get("/list")
async def api_list_worldbooks():
    """获取世界书条目列表"""
    return list_worldbooks()


@router.post("/create")
async def api_create_worldbook(req: WorldBookCreateRequest):
    """创建世界书条目

    如果未提供 ID，将自动生成唯一 ID
    """
    # 如果没有提供 ID，自动生成
    entry_id = req.id or _generate_worldbook_id()

    try:
        entry = create_worldbook(entry_id, req.model_dump())
        return entry
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"世界书条目已存在: {entry_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# 通配路径 CRUD（放最后）

@router.get("/{entry_id}")
async def api_get_worldbook(entry_id: str):
    """获取单个世界书条目详情"""
    try:
        return load_worldbook(entry_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"世界书条目不存在: {entry_id}")


@router.put("/{entry_id}")
async def api_update_worldbook(entry_id: str, req: WorldBookUpdateRequest):
    """更新世界书条目（部分更新）"""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    try:
        return update_worldbook(entry_id, updates)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"世界书条目不存在: {entry_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{entry_id}")
async def api_delete_worldbook(entry_id: str):
    """删除世界书条目"""
    try:
        delete_worldbook(entry_id)
        return {"message": f"已删除世界书条目: {entry_id}"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"世界书条目不存在: {entry_id}")
