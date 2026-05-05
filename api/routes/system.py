"""
系统管理 API — 图谱提取触发、梦境管理、状态查询
"""

import time
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


# ── 图谱提取 ──


class ForceExtractRequest(BaseModel):
    character_id: str = ""
    lookback_hours: int = Field(default=24, ge=1, le=168, description="扫描最近多少小时的日记")


@router.post("/force_extract")
async def force_extract(req: ForceExtractRequest):
    """手动触发图谱提取：扫描最近 N 小时的日记，送入事件处理器"""
    from lumen.core.event_processor import enqueue_event
    from lumen.services.knowledge import _get_agent_db
    db = _get_agent_db()

    cutoff = time.time() - req.lookback_hours * 3600
    events_enqueued = 0
    skipped = 0

    for nid in db.all_node_ids():
        try:
            node = db.get(nid)
            payload = node.payload if hasattr(node, "payload") else {}
        except Exception:
            continue

        if not payload:
            continue

        source = payload.get("source", "")
        if source not in ("daily_note", "graph_extract"):
            continue

        if req.character_id and payload.get("owner_id", "") != req.character_id:
            continue

        content = payload.get("content", "")
        if not content or len(content) < 50:
            skipped += 1
            continue

        if enqueue_event(
            content=content,
            event_type="diary",
            character_id=payload.get("owner_id", req.character_id),
            source_id=payload.get("file_id", ""),
            metadata={"category": payload.get("category", ""), "tags": payload.get("tags", [])},
        ):
            events_enqueued += 1
        else:
            skipped += 1

    return {
        "status": "ok",
        "events_enqueued": events_enqueued,
        "skipped": skipped,
        "lookback_hours": req.lookback_hours,
        "character_id": req.character_id or "all",
    }


# ── T22 Step 4: 深梦境管理 ──


class TriggerDreamRequest(BaseModel):
    character_id: str = ""


@router.post("/trigger_dream")
async def trigger_dream(req: TriggerDreamRequest):
    """手动触发一次深梦境：涟漪召回 → 梦境叙事 → 投入事件处理器"""
    from lumen.core.dream import run_deep_dream

    if not req.character_id:
        from lumen.core.dream import _get_characters_with_diaries
        chars = _get_characters_with_diaries()
        if not chars:
            raise HTTPException(status_code=400, detail="没有找到有日记记录的角色")
        req.character_id = chars[0]

    result = await run_deep_dream(req.character_id)
    if result is None:
        return {"status": "skipped", "reason": "涟漪召回为空或叙事生成失败"}

    return {
        "status": "ok",
        "dream_id": result.dream_id,
        "character_id": result.character_id,
        "recalled_count": result.recalled_count,
        "narrative_preview": result.narrative[:300],
        "cards_generated": result.cards_generated,
        "duration_ms": result.duration_ms,
    }


@router.get("/dream_status")
async def dream_status():
    """返回深梦境调度器状态"""
    from lumen.core.dream import get_dream_scheduler

    scheduler = get_dream_scheduler()
    if scheduler is None:
        return {"status": "not_initialized"}

    status = scheduler.get_status()
    status["status"] = "running"
    return status
