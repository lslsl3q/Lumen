"""
系统管理 API — 反思触发、状态查询
"""

import time
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class ForceReflectRequest(BaseModel):
    character_id: str = ""
    lookback_hours: int = Field(default=24, ge=1, le=168, description="扫描最近多少小时的日记")


@router.post("/force_reflect")
async def force_reflect(req: ForceReflectRequest):
    """手动触发反思：扫描最近 N 小时的日记，送入反思管道"""
    from lumen.core.reflection import enqueue_reflection, get_last_result
    from lumen.events.schema import ReflectionEvent, SourceType
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

        # 只处理日记来源的条目
        source = payload.get("source", "")
        if source not in ("daily_note", "reflection_pipeline", "graph_extract"):
            continue

        if req.character_id and payload.get("owner_id", "") != req.character_id:
            continue

        content = payload.get("content", "")
        if not content or len(content) < 50:
            skipped += 1
            continue

        # 简单时间过滤（有 file_id 的优先按 file_id 中的时间戳）
        file_id = payload.get("file_id", "")
        if file_id and file_id.startswith("refl_"):
            # 跳过已经反思过的条目，除非强制
            skipped += 1
            continue

        event = ReflectionEvent(
            source_type=SourceType.DIARY_ENTRY,
            timestamp=time.time(),
            content=content,
            summary=content[:200],
            session_id=payload.get("session_id", ""),
            character_id=payload.get("owner_id", req.character_id),
            source_id=payload.get("file_id", ""),
            metadata={
                "category": payload.get("category", ""),
                "tags": payload.get("tags", []),
                "node_id": nid,
            },
        )

        if enqueue_reflection(event):
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


@router.get("/reflection_status")
async def reflection_status():
    """返回最近一次反思运行状态"""
    from lumen.core.reflection import get_last_result
    last = get_last_result()
    if last is None:
        return {"status": "idle", "last_run": None, "result": None}

    return {
        "status": "completed" if last.output else "idle",
        "last_run": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "result": {
            "event_summary": last.event_summary,
            "emotional_valence": last.emotional_valence,
            "trigger1_fired": last.trigger1_fired,
            "trigger2_fired": last.trigger2_fired,
            "trigger3_fired": last.trigger3_fired,
            "cards_stored": last.cards_stored,
            "store_details": last.store_details,
            "duration_ms": last.duration_ms,
        },
    }


# ── T22 Step 4: 深梦境管理 ──


class TriggerDreamRequest(BaseModel):
    character_id: str = ""


@router.post("/trigger_dream")
async def trigger_dream(req: TriggerDreamRequest):
    """手动触发一次深梦境：涟漪召回 → 梦境叙事 → 投入热反思管道"""
    from lumen.core.dream import run_deep_dream

    if not req.character_id:
        # 自动选第一个有日记的角色
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
