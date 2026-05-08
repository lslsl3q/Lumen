"""
RPG WorldState REST API — 房间/实体/事件的 CRUD 端点

数据层：lumen.services.world_state（SQLite 同步层）
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from lumen.services.storage.world_state import (
    get_room, ensure_room, list_agents_in_room,
    get_agent_state, ensure_agent, update_agent, remove_agent,
    get_room_entities, get_recent_events, resolve_agent_id,
)

router = APIRouter()


# ── 请求模型 ──

class RoomCreate(BaseModel):
    room_id: str
    name: str = ""
    metadata: dict = {}

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    metadata: Optional[dict] = None

class AgentCreate(BaseModel):
    agent_id: str
    name: str = ""
    room_id: str = "start"
    hp: int = 100
    max_hp: Optional[int] = None
    attrs: dict = {}

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    room_id: Optional[str] = None
    hp: Optional[int] = None
    max_hp: Optional[int] = None
    attrs: Optional[dict] = None
    status: Optional[dict] = None


# ── 房间 ──

@router.get("/rooms")
async def list_rooms():
    """列出所有房间（简要信息）"""
    # WorldStateService 没有 list_rooms，通过 SQL 直查
    from lumen.services.storage.world_state import _get_conn
    conn = _get_conn()
    rows = conn.execute("SELECT room_id, name, metadata FROM rooms ORDER BY room_id").fetchall()
    return [
        {"room_id": r["room_id"], "name": r["name"], "metadata": r["metadata"]}
        for r in rows
    ]


@router.get("/rooms/{room_id}")
async def get_room_detail(room_id: str, include_entities: bool = True):
    """获取房间详情 + 可选包含的所有实体"""
    room = get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"房间 {room_id} 不存在")
    result = dict(room)
    if include_entities:
        result["entities"] = get_room_entities(room_id)
    return result


@router.post("/rooms")
async def create_room(req: RoomCreate):
    """创建新房间"""
    existing = get_room(req.room_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"房间 {req.room_id} 已存在")
    return ensure_room(req.room_id, name=req.name, **req.metadata)


@router.put("/rooms/{room_id}")
async def update_room(room_id: str, req: RoomUpdate):
    """更新房间名称或元数据"""
    room = get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"房间 {room_id} 不存在")

    from lumen.services.storage.world_state import _get_conn, _write_lock
    updates = {}
    if req.name is not None:
        updates["name"] = req.name
    if req.metadata is not None:
        import json
        updates["metadata"] = json.dumps(req.metadata, ensure_ascii=False)

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        with _write_lock:
            conn = _get_conn()
            conn.execute(
                f"UPDATE rooms SET {set_clause} WHERE room_id = ?",
                list(updates.values()) + [room_id],
            )
            conn.commit()

    return get_room(room_id)


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str):
    """删除房间（不级联删除实体，实体会变成流浪状态）"""
    room = get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail=f"房间 {room_id} 不存在")

    from lumen.services.storage.world_state import _get_conn, _write_lock
    with _write_lock:
        conn = _get_conn()
        conn.execute("DELETE FROM rooms WHERE room_id = ?", (room_id,))
        conn.commit()
    return {"deleted": room_id}


# ── 实体/Agent ──

@router.get("/agents")
async def list_agents(
    room_id: Optional[str] = Query(None),
    resolve_name: Optional[str] = Query(None),
):
    """列出实体（可选按房间过滤或按名字解析）"""
    if resolve_name:
        resolved = resolve_agent_id(resolve_name, room_id or "")
        return {"query": resolve_name, "resolved_id": resolved}

    if room_id:
        entities = get_room_entities(room_id)
        return [{"agent_id": e["id"], "name": e["name"],
                 "hp": e["hp"], "max_hp": e["max_hp"]} for e in entities]

    # 无过滤时列出全部
    from lumen.services.storage.world_state import _get_conn
    conn = _get_conn()
    rows = conn.execute(
        "SELECT agent_id, name, room_id, hp, max_hp FROM agent_state ORDER BY agent_id"
    ).fetchall()
    return [
        {"agent_id": r["agent_id"], "name": r["name"],
         "room_id": r["room_id"], "hp": r["hp"], "max_hp": r["max_hp"]}
        for r in rows
    ]


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """获取实体完整状态（含属性和状态效果）"""
    state = get_agent_state(agent_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"实体 {agent_id} 不存在")
    return state


@router.post("/agents")
async def create_agent(req: AgentCreate):
    """创建新实体"""
    existing = get_agent_state(req.agent_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"实体 {req.agent_id} 已存在")
    return ensure_agent(
        req.agent_id,
        room_id=req.room_id,
        name=req.name,
        hp=req.hp,
        max_hp=req.max_hp or req.hp,
        attrs=req.attrs,
    )


@router.put("/agents/{agent_id}")
async def update_agent_endpoint(agent_id: str, req: AgentUpdate):
    """更新实体状态（HP/属性/位置/状态效果）"""
    fields = {k: v for k, v in req.dict(exclude_unset=True).items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="没有提供要更新的字段")

    result = update_agent(agent_id, **fields)
    if not result:
        raise HTTPException(status_code=404, detail=f"实体 {agent_id} 不存在")
    return result


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """删除实体"""
    ok = remove_agent(agent_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"实体 {agent_id} 不存在")
    return {"deleted": agent_id}


# ── 事件 ──

@router.get("/rooms/{room_id}/events")
async def get_room_events(
    room_id: str,
    limit: int = Query(20, ge=1, le=200),
    campaign_id: str = "",
):
    """获取房间最近事件（按时间正序）"""
    return get_recent_events(room_id, limit=limit, campaign_id=campaign_id)
