"""权限管理 API 接口"""
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()


class PermissionEntry(BaseModel):
    folder_path: str
    action: str  # "read" | "write"
    access: str  # "allow" | "deny"


class BatchPermissionRequest(BaseModel):
    resource_type: str
    resource_id: str
    entries: List[PermissionEntry]


@router.get("/character/{character_id}")
async def get_character_permissions(
    character_id: str,
    resource_type: str,
    resource_id: str,
):
    """角色视角：获取该角色在某资源下的所有权限规则"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    return await asyncio.to_thread(
        acl.get_permissions, character_id, resource_type, resource_id
    )


@router.get("/resource/{resource_type}/{resource_id}")
async def get_resource_permissions(
    resource_type: str,
    resource_id: str,
    folder_path: str = "",
    action: str = "read",
):
    """资源视角：获取某路径有权限的角色列表"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    return await asyncio.to_thread(
        acl.get_characters_with_access, resource_type, resource_id, folder_path, action
    )


@router.put("/character/{character_id}")
async def set_character_permissions(
    character_id: str,
    req: BatchPermissionRequest,
):
    """批量更新角色的权限规则"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    entries = [e.model_dump() for e in req.entries]
    await asyncio.to_thread(
        acl.batch_set_permissions, character_id, req.resource_type, req.resource_id, entries
    )
    return {"status": "ok", "count": len(entries)}


@router.put("/resource/{resource_type}/{resource_id}")
async def set_resource_permissions(
    resource_type: str,
    resource_id: str,
    character_id: str,
    req: BatchPermissionRequest,
):
    """批量更新资源的权限规则（按资源视角）"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    entries = [e.model_dump() for e in req.entries]
    await asyncio.to_thread(
        acl.batch_set_permissions, character_id, resource_type, resource_id, entries
    )
    return {"status": "ok", "count": len(entries)}
