"""
图谱管理 API（通用，支持任意 TDB）+ TQL 统一查询（v0.6.0）

GET    /graph/{tdb}/entities           — 列出实体（?type=person，走 TQL FIND）
POST   /graph/{tdb}/entities           — 新建实体
PUT    /graph/{tdb}/entities/{id}      — 更新实体 payload
DELETE /graph/{tdb}/entities/{id}      — 删除实体 + 关联边
GET    /graph/{tdb}/edges              — 列出所有边
POST   /graph/{tdb}/edges              — 新建边
DELETE /graph/{tdb}/edges/{src}/{dst}  — 删除边
GET    /graph/{tdb}/neighbors/{id}     — 邻居查询（?depth=2）
POST   /graph/{tdb}/re-extract         — 对已有 chunks 重抽图谱
POST   /graph/{tdb}/tql                — TQL 只读查询（MATCH/FIND/SEARCH）
POST   /graph/{tdb}/tql_mut            — TQL 写操作（CREATE/SET/DELETE）
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from lumen.services.graph import save_graph, auto_git_commit


def _backup_after_write(tdb: str):
    """写操作后自动备份（失败不影响主操作）"""
    try:
        save_graph(tdb)
        auto_git_commit(f"图谱更新: {tdb}")
    except Exception as e:
        logger.debug(f"图谱自动备份跳过: {e}")

logger = logging.getLogger(__name__)

router = APIRouter()

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 允许通过 API 访问的 TDB 名称
_ALLOWED_TDBS = {"knowledge", "memory"}


def _get_tdb(tdb_name: str):
    """根据名称获取 TriviumDB 实例"""
    if tdb_name not in _ALLOWED_TDBS:
        raise HTTPException(404, f"未知 TDB: {tdb_name}")

    if tdb_name == "knowledge":
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
    """列出实体 — v0.6.0 使用 TQL FIND（O(1) 属性索引加速）"""
    db = _get_tdb(tdb)
    try:
        entities = []
        if type:
            # 有 type 过滤 → TQL FIND 走属性索引 O(1)
            safe_type = type.replace('\\', '\\\\').replace('"', '\\"')
            try:
                rows = db.tql(f'FIND {{type: "{safe_type}"}} RETURN *')
                for query_row in rows:
                    first = list(query_row.row.values())[0] if query_row.row else {}
                    nid = first.get("id", 0)
                    payload = first.get("payload", {})
                    if nid and payload:
                        entities.append({"id": nid, "payload": payload})
                return {"entities": entities, "total": len(entities)}
            except Exception:
                pass  # TQL 失败，回退到 all_node_ids

        # 无 type 过滤或 TQL 回退 → all_node_ids（TQL FIND 不允许空 filter {}）
        node_ids = db.all_node_ids()
        for nid in node_ids:
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if "name" not in payload or "type" not in payload:
                continue
            if type and payload.get("type", "") != type:
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
        _backup_after_write(tdb)

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
        _backup_after_write(tdb)
        return {"message": f"已更新: {node_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"更新实体失败: {e}")


@router.delete("/{tdb}/entities/{node_id}")
async def delete_entity(tdb: str, node_id: int):
    """删除实体 + 关联边（v0.6.0 优先 TQL DETACH DELETE）"""
    db = _get_tdb(tdb)
    try:
        node = db.get(node_id)
        if not node:
            raise HTTPException(404, f"节点 {node_id} 不存在")

        payload = node.payload if hasattr(node, "payload") else {}
        name = payload.get("name", "")
        etype = payload.get("type", "")

        deleted = False
        # 优先 TQL DETACH DELETE：一次语句删节点 + 所有关联边
        if name and etype:
            # 转义 TQL 字符串内的双引号
            safe_name = name.replace('\\', '\\\\').replace('"', '\\"')
            safe_type = etype.replace('\\', '\\\\').replace('"', '\\"')
            try:
                result = db.tql_mut(
                    f'MATCH (a {{name: "{safe_name}", type: "{safe_type}"}}) DETACH DELETE a'
                )
                if result.get("affected", 0) > 0:
                    deleted = True
            except Exception:
                pass  # TQL 失败则回退到手动模式

        if not deleted:
            # 回退：手动删边 + 删节点
            neighbors = db.neighbors(node_id, depth=1)
            for neighbor_id in neighbors:
                try:
                    db.unlink(node_id, neighbor_id)
                except Exception:
                    pass
            db.delete(node_id)

        db.flush()
        _backup_after_write(tdb)
        return {"message": f"已删除: {node_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"删除实体失败: {e}")


# ── 边 CRUD ──

@router.get("/{tdb}/edges")
async def list_edges(tdb: str):
    """列出所有边（v0.6.0 使用 TQL FIND 预过滤实体节点）"""
    db = _get_tdb(tdb)
    try:
        seen = set()
        edges = []

        # 收集图谱实体节点（有 name+type 的节点）
        # TQL FIND 不允许空 filter，直接走 all_node_ids
        entity_nodes = []
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if "name" in payload and "type" in payload:
                entity_nodes.append((nid, payload))

        for nid, payload in entity_nodes:
            try:
                neighbor_ids = db.neighbors(nid, depth=1)
            except Exception:
                continue

            for dst_id in neighbor_ids:
                edge_key = (nid, dst_id)
                if edge_key in seen:
                    continue
                seen.add(edge_key)

                try:
                    dst_node = db.get(dst_id)
                except Exception:
                    continue
                dst_payload = dst_node.payload if dst_node and hasattr(dst_node, "payload") else {}

                edges.append({
                    "src": nid,
                    "src_name": payload.get("name", str(nid)),
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
        _backup_after_write(tdb)
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
        _backup_after_write(tdb)
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


# ── 图谱重抽 ──

class ReExtractRequest(BaseModel):
    source_path: str = ""  # 空字符串 = 重抽全部，否则只抽指定文件


@router.post("/{tdb}/re-extract")
async def re_extract_graph(tdb: str, req: ReExtractRequest):
    """对已有 TDB chunks 重跑图谱抽取（不重做向量）

    流程：
    1. 遍历 TDB，收集有 content+source_path 的 chunk 条目
    2. 按 source_path 过滤（可选）
    3. 逐条调 extract_and_store（LLM 抽取 → batch_upsert）
    """
    if tdb not in _ALLOWED_TDBS:
        raise HTTPException(404, f"未知 TDB: {tdb}")

    db = _get_tdb(tdb)

    # 收集 chunks
    chunks = []
    for nid in db.all_node_ids():
        try:
            node = db.get(nid)
        except Exception:
            continue
        if not node:
            continue
        payload = node.payload if hasattr(node, "payload") else {}
        content = payload.get("content", "")
        sp = payload.get("source_path", "")
        if not content or not sp:
            continue
        # 跳过图谱实体（name+type 但无 content/source_path）
        if "name" in payload and "type" in payload and not payload.get("source"):
            continue
        # 按文件过滤
        if req.source_path and sp != req.source_path:
            continue
        chunks.append({
            "id": nid,
            "content": content,
            "source_path": sp,
            "file_id": payload.get("file_id", ""),
        })

    if not chunks:
        return {"success": True, "chunks_processed": 0, "total_entities": 0, "total_edges": 0}

    # 按 source_path 分组，每个文件一次性抽取
    from collections import defaultdict
    by_file = defaultdict(list)
    for ch in chunks:
        by_file[ch["source_path"]].append(ch)

    from lumen.services.graph import extract_and_store

    total_entities = 0
    total_edges = 0
    files_processed = 0
    errors = []

    for sp, file_chunks in by_file.items():
        # 合并同文件的所有 chunks 作为完整文本
        full_text = "\n\n".join(ch["content"] for ch in sorted(file_chunks, key=lambda x: x["id"]))
        fid = file_chunks[0].get("file_id", "")

        try:
            result = await extract_and_store(
                content=full_text,
                tdb_name=tdb,
                source_episode_id=fid,
                owner_id="",
            )
            if result:
                total_entities += result.get("entities_created", 0)
                total_edges += result.get("edges_created", 0)
            files_processed += 1
        except Exception as e:
            errors.append(f"{sp}: {e}")
            logger.warning(f"图谱重抽失败 ({sp}): {e}")

    if total_entities or total_edges:
        _backup_after_write(tdb)

    return {
        "success": True,
        "files_processed": files_processed,
        "total_files": len(by_file),
        "total_entities": total_entities,
        "total_edges": total_edges,
        "errors": errors[:10],
    }


# ── TQL 统一查询（v0.6.0 新增）──

class TqlRequest(BaseModel):
    query: str  # MATCH / FIND / SEARCH / CREATE / SET / DELETE


@router.post("/{tdb}/tql")
async def tql_query(tdb: str, req: TqlRequest):
    """执行 TQL 只读查询（MATCH / FIND / SEARCH）

    示例：
      FIND {} RETURN *                     — 列出所有实体
      FIND {type: "Character"} RETURN *    — 按类型过滤
      MATCH (a)-[:knows]->(b) RETURN a, b  — 图谱遍历
    """
    db = _get_tdb(tdb)
    try:
        rows = db.tql(req.query)
        return {"rows": rows, "total": len(rows)}
    except Exception as e:
        raise HTTPException(500, f"TQL 查询失败: {e}")


@router.post("/{tdb}/tql_mut")
async def tql_mutate(tdb: str, req: TqlRequest):
    """执行 TQL 写操作（CREATE / SET / DELETE）
    写操作后自动备份。
    """
    db = _get_tdb(tdb)
    try:
        result = db.tql_mut(req.query)
        db.flush()
        _backup_after_write(tdb)
        return {"result": str(result)}
    except Exception as e:
        raise HTTPException(500, f"TQL 执行失败: {e}")


# ── Leiden 社区检测（v0.5.2+，Python 绑定待跟进）──

# RESERVED: TriviumDB v0.5.2 内置 Leiden 聚类（graph/leiden.rs），但 Python 绑定尚未暴露。
# 源码可用：db.leiden_cluster(min_community_size=3, max_iterations=15)
# 用途：跑团章节末尾分析 world.tdb 社群结构，自动发现"盗贼公会"等涌现设定。
# 绑定就绪后加：@router.post("/{tdb}/leiden")


# ── Dry-Run 事务（v0.6.0，Python 绑定待跟进）──

# RESERVED: TriviumDB v0.6.0 内置 begin_tx() + commit() 零开销回滚事务。
# 跑团模式关键状态变更（NPC死亡、资产转移）时使用。
# 绑定就绪后加：api/routes/graph.py 事务端点 或 core/transaction.py
