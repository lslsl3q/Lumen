"""
图谱管理 API（通用，支持任意 TDB）

GET    /graph/{tdb}/entities           — 列出实体（?type=person）
POST   /graph/{tdb}/entities           — 新建实体
PUT    /graph/{tdb}/entities/{id}      — 更新实体 payload
DELETE /graph/{tdb}/entities/{id}      — 删除实体 + 关联边
GET    /graph/{tdb}/edges              — 列出所有边
POST   /graph/{tdb}/edges              — 新建边
DELETE /graph/{tdb}/edges/{src}/{dst}  — 删除边
GET    /graph/{tdb}/neighbors/{id}     — 邻居查询（?depth=2）
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 允许通过 API 访问的 TDB 名称
_ALLOWED_TDBS = {"buffer", "knowledge", "memory"}


def _get_tdb(tdb_name: str):
    """根据名称获取 TriviumDB 实例"""
    if tdb_name not in _ALLOWED_TDBS:
        raise HTTPException(404, f"未知 TDB: {tdb_name}")

    if tdb_name == "buffer":
        from lumen.services.buffer import _get_db
        if not _get_db():
            raise HTTPException(400, "缓冲区未初始化")
        return _get_db()
    elif tdb_name == "knowledge":
        from lumen.services.knowledge import _get_db
        return _get_db()
    elif tdb_name == "memory":
        from lumen.services.vector_store import _get_db
        return _get_db()


# ── 请求/响应模型 ──

class EntityCreate(BaseModel):
    name: str
    type: str = "entity"
    extra: dict = {}


class EntityUpdate(BaseModel):
    payload: dict


class EdgeCreate(BaseModel):
    src: int
    dst: int
    label: str = "related"
    weight: float = 1.0


# ── 实体 CRUD ──

@router.get("/{tdb}/entities")
async def list_entities(
    tdb: str,
    type: str = Query("", description="按 type 过滤"),
):
    """列出实体（用 all_node_ids 遍历，filter_where 不可靠）"""
    db = _get_tdb(tdb)
    try:
        node_ids = db.all_node_ids()
        entities = []
        for nid in node_ids:
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            # 只返回图谱实体（有 name+type，不是知识库条目）
            if "name" not in payload or "type" not in payload:
                continue
            node_type = payload.get("type", "")
            if type and node_type != type:
                continue
            entities.append({
                "id": node.id if hasattr(node, "id") else nid,
                "payload": payload,
            })
        return {"entities": entities, "total": len(entities)}
    except Exception as e:
        raise HTTPException(500, f"查询实体失败: {e}")


@router.post("/{tdb}/entities")
async def create_entity(tdb: str, req: EntityCreate):
    """新建实体（插入带 type/name payload 的节点）"""
    db = _get_tdb(tdb)
    try:
        import random
        from lumen.services.embedding import resolve_dimensions
        dim = resolve_dimensions(tdb)
        vector = [random.gauss(0, 0.01) for _ in range(dim)]

        payload = {"name": req.name, "type": req.type, **req.extra}
        node_id = db.insert(vector, payload)
        db.flush()

        return {"id": node_id, "payload": payload}
    except Exception as e:
        raise HTTPException(500, f"创建实体失败: {e}")


@router.put("/{tdb}/entities/{node_id}")
async def update_entity(tdb: str, node_id: int, req: EntityUpdate):
    """更新实体 payload"""
    db = _get_tdb(tdb)
    try:
        node = db.get(node_id)
        if not node:
            raise HTTPException(404, f"节点 {node_id} 不存在")

        existing = node.payload if hasattr(node, "payload") else {}
        existing.update(req.payload)
        db.update_payload(node_id, existing)
        db.flush()
        return {"message": f"已更新: {node_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"更新实体失败: {e}")


@router.delete("/{tdb}/entities/{node_id}")
async def delete_entity(tdb: str, node_id: int):
    """删除实体 + 关联边"""
    db = _get_tdb(tdb)
    try:
        node = db.get(node_id)
        if not node:
            raise HTTPException(404, f"节点 {node_id} 不存在")

        # 删除关联的边
        neighbors = db.neighbors(node_id, depth=1)
        for neighbor_id in neighbors:
            try:
                db.unlink(node_id, neighbor_id)
            except Exception:
                pass
            try:
                db.unlink(neighbor_id, node_id)
            except Exception:
                pass

        db.delete(node_id)
        db.flush()
        return {"message": f"已删除: {node_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"删除实体失败: {e}")


# ── 边 CRUD ──

@router.get("/{tdb}/edges")
async def list_edges(tdb: str):
    """列出所有边（遍历所有节点的邻居去重）"""
    db = _get_tdb(tdb)
    try:
        all_nodes = db.filter_where({})
        seen = set()
        edges = []

        for node in all_nodes:
            node_id = node.id if hasattr(node, "id") else None
            if node_id is None:
                continue

            neighbors = db.neighbors(node_id, depth=1)
            for dst_id in neighbors:
                edge_key = (node_id, dst_id)
                if edge_key in seen:
                    continue
                seen.add(edge_key)

                dst_node = db.get(dst_id)
                dst_payload = dst_node.payload if dst_node and hasattr(dst_node, "payload") else {}

                edges.append({
                    "src": node_id,
                    "src_name": (node.payload if hasattr(node, "payload") else {}).get("name", str(node_id)),
                    "dst": dst_id,
                    "dst_name": dst_payload.get("name", str(dst_id)),
                })

        return {"edges": edges, "total": len(edges)}
    except Exception as e:
        raise HTTPException(500, f"查询边失败: {e}")


@router.post("/{tdb}/edges")
async def create_edge(tdb: str, req: EdgeCreate):
    """新建边"""
    db = _get_tdb(tdb)
    try:
        src_node = db.get(req.src)
        dst_node = db.get(req.dst)
        if not src_node:
            raise HTTPException(404, f"源节点 {req.src} 不存在")
        if not dst_node:
            raise HTTPException(404, f"目标节点 {req.dst} 不存在")

        db.link(req.src, req.dst, label=req.label, weight=req.weight)
        db.flush()
        return {"message": f"已连接: {req.src} → {req.dst}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"创建边失败: {e}")


@router.delete("/{tdb}/edges/{src}/{dst}")
async def delete_edge(tdb: str, src: int, dst: int):
    """删除边"""
    db = _get_tdb(tdb)
    try:
        db.unlink(src, dst)
        db.flush()
        return {"message": f"已断开: {src} → {dst}"}
    except Exception as e:
        raise HTTPException(500, f"删除边失败: {e}")


# ── 邻居查询 ──

@router.get("/{tdb}/neighbors/{node_id}")
async def get_neighbors(
    tdb: str,
    node_id: int,
    depth: int = Query(1, ge=1, le=3),
):
    """查询节点的邻居"""
    db = _get_tdb(tdb)
    try:
        neighbor_ids = db.neighbors(node_id, depth=depth)
        neighbors = []
        for nid in neighbor_ids:
            node = db.get(nid)
            payload = node.payload if node and hasattr(node, "payload") else {}
            neighbors.append({
                "id": nid,
                "payload": payload,
            })
        return {"node_id": node_id, "depth": depth, "neighbors": neighbors}
    except Exception as e:
        raise HTTPException(500, f"邻居查询失败: {e}")
