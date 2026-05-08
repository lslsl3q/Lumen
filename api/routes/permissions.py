"""权限管理 API — 纯白名单模型"""
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal

router = APIRouter()


class PermissionEntry(BaseModel):
    folder_path: str
    action: Literal["read", "write"] = "read"


class BatchCheckRequest(BaseModel):
    resource_type: str
    resource_id: str
    folder_path: str = ""
    action: Literal["read", "write"] = "read"
    character_ids: List[str]


class GrantRequest(BaseModel):
    resource_type: str
    resource_id: str
    folder_path: str = ""
    action: Literal["read", "write"] = "read"


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


@router.post("/batch-check")
async def batch_check_permissions(req: BatchCheckRequest):
    """批量检查多个角色对同一资源的权限，返回 {char_id: bool}"""
    if len(req.character_ids) > 200:
        raise HTTPException(400, "character_ids 超过上限（200）")
    from lumen.services.access_control import get_instance
    acl = get_instance()
    return await asyncio.to_thread(
        acl.batch_check, req.resource_type, req.resource_id,
        req.folder_path, req.action, req.character_ids,
    )


@router.put("/character/{character_id}/grant")
async def grant_access(character_id: str, req: GrantRequest):
    """授予角色访问权限"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    await asyncio.to_thread(
        acl.grant, character_id, req.resource_type, req.resource_id,
        req.folder_path, req.action,
    )
    return {"status": "ok"}


@router.delete("/character/{character_id}/revoke")
async def revoke_access(
    character_id: str,
    resource_type: str,
    resource_id: str,
    folder_path: str = "",
    action: str = "read",
):
    """撤销角色访问权限"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    await asyncio.to_thread(
        acl.revoke, character_id, resource_type, resource_id, folder_path, action,
    )
    return {"status": "ok"}


@router.put("/character/{character_id}")
async def set_character_permissions(
    character_id: str,
    resource_type: str,
    resource_id: str,
    entries: List[PermissionEntry],
):
    """批量设置角色的权限规则（覆盖式）"""
    from lumen.services.access_control import get_instance
    acl = get_instance()
    await asyncio.to_thread(
        acl.batch_set, character_id, resource_type, resource_id,
        [e.model_dump() for e in entries]
    )
    return {"status": "ok", "count": len(entries)}
