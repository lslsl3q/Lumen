"""
事件处理器 — 从事件队列中消费事件，提取图谱关系并更新。

队列由 services/event_queue.py 管理（基础设施层），本模块只负责消费。
支持跑团隔离（campaign_id 限定图谱）和日常模式（全局 knowledge 图谱）。

生命周期：绑定 FastAPI startup/shutdown，asyncio.Queue + 消费者模式。
T27 Phase 3：订阅 HookBus 事件，RPG 动作完成后自动触发图谱提取。
"""

import asyncio
import logging
from typing import Optional

from lumen.services.event_queue import init_event_queue, get_event_queue, enqueue_event

logger = logging.getLogger(__name__)

_consumer_task: Optional[asyncio.Task] = None


async def _consumer():
    """后台消费者：串行处理事件，调用图谱提取管道"""
    queue = get_event_queue()
    while True:
        event = await queue.get()
        if event is None:  # 毒药药丸：优雅停机
            logger.info("事件处理器收到停机信号")
            break
        try:
            from lumen.services.graph.extract import extract_and_store

            metadata = event.get("metadata") or {}
            tdb_name = event.get("campaign_id") or "knowledge"
            # source_path：优先 metadata → event_type 兜底
            source_path = metadata.get("source_path", event.get("event_type", ""))
            result = await extract_and_store(
                content=event["content"],
                tdb_name=tdb_name,
                source_path=source_path,
                source_doc_id=event.get("source_id") or None,
                source_type=event.get("event_type", "file_chunk"),
            )
            if result:
                logger.info(
                    f"图谱提取完成 [episode={result.get('episode_id')}, "
                    f"source={event.get('source_id')}]: "
                    f"{result.get('entities_created', 0)} 实体, "
                    f"{result.get('edges_created', 0)} 关系"
                )
        except Exception as e:
            logger.error(f"事件处理失败 [{event.get('source_id')}]: {e}")
        finally:
            queue.task_done()

        # 日记事件：通知深梦境调度器（日记积累计数）
        if event and event.get("event_type") == "diary":
            try:
                from lumen.core.dream import get_dream_scheduler
                scheduler = get_dream_scheduler()
                if scheduler:
                    scheduler.notify_diary_saved()
            except Exception:
                pass


def init_event_processor():
    """FastAPI startup 调用，初始化队列并启动后台消费者"""
    global _consumer_task
    init_event_queue()
    _consumer_task = asyncio.create_task(_consumer())
    logger.info("事件处理器已启动")


async def shutdown_event_processor():
    """FastAPI shutdown 调用，毒药药丸停机"""
    global _consumer_task
    queue = get_event_queue()
    if _consumer_task and queue is not None:
        logger.info("事件处理器停机中...")
        await queue.put(None)  # 毒药药丸
        await _consumer_task
        _consumer_task = None
        logger.info("事件处理器已停止")


# ── T27 Phase 3: HookBus 订阅 ──

def register_hook_handlers():
    """注册 EventProcessor 为 HookBus 事件处理器。

    RPG 动作完成后自动触发图谱提取，不再需要 world_state.py 直接调用 enqueue_event。
    旧的直接调用路径（daily_note/dream/system）保留，逐步迁移。
    """
    from lumen.core.hook_bus import HookBus

    bus = HookBus.get()

    async def _on_content_created(payload):
        """content.created → enqueue_event"""
        enqueue_event(
            content=payload.content,
            event_type=payload.content_type,
            character_id=payload.character_id,
            session_id=payload.session_id,
            source_id=payload.source_id,
            campaign_id=payload.campaign_id,
        )

    bus.register(
        "content.created",
        _on_content_created,
        priority=50,
        name="event_processor.on_content_created",
    )

    async def _on_rpg_action_completed(payload):
        """rpg.action.completed → 自动提取图谱（RPG 场景摘要文本）"""
        if payload.result_text:
            # TODO: room_id 是 campaign_id 的临时替代；等 RPG session 管理完成后
            # 应从 payload 取 campaign_id 或从 WorldState 查询
            enqueue_event(
                content=payload.result_text,
                event_type="rpg",
                character_id=payload.actor_id,
                source_id=f"rpg_{payload.actor_id}",
                campaign_id=payload.room_id,
            )

    bus.register(
        "rpg.action.completed",
        _on_rpg_action_completed,
        priority=95,  # 在 PlotEngine(80) 之后执行
        name="event_processor.on_rpg_action",
    )
