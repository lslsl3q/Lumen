"""
事件处理器 — 从事件中提取图谱关系并更新。

替代反思管道（reflection.py），只做一件事：事件 → 图谱提取 → 关系写入。
支持跑团隔离（campaign_id 限定图谱）和日常模式（全局 knowledge 图谱）。

生命周期：绑定 FastAPI startup/shutdown，asyncio.Queue + 消费者模式。
T27 Phase 3：订阅 HookBus 事件，RPG 动作完成后自动触发图谱提取。
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── 队列与消费者 ──

_queue: Optional[asyncio.Queue] = None
_consumer_task: Optional[asyncio.Task] = None


async def _consumer():
    """后台消费者：串行处理事件，调用图谱提取管道"""
    while True:
        event = await _queue.get()
        if event is None:  # 毒药药丸：优雅停机
            logger.info("事件处理器收到停机信号")
            break
        try:
            from lumen.services.graph.extract import extract_and_store

            tdb_name = event.get("campaign_id") or "knowledge"
            result = await extract_and_store(
                content=event["content"],
                tdb_name=tdb_name,
                source_episode_id=event.get("source_id", ""),
                owner_id=event.get("character_id", ""),
            )
            if result:
                logger.info(
                    f"图谱提取完成 [{event.get('source_id')}]: "
                    f"{result.get('entities_created', 0)} 实体, "
                    f"{result.get('edges_created', 0)} 关系"
                )
        except Exception as e:
            logger.error(f"事件处理失败 [{event.get('source_id')}]: {e}")
        finally:
            _queue.task_done()


def init_event_processor():
    """FastAPI startup 调用，启动后台消费者"""
    global _queue, _consumer_task
    if _queue is None:
        _queue = asyncio.Queue(maxsize=100)
        _consumer_task = asyncio.create_task(_consumer())
        logger.info("事件处理器已启动")


async def shutdown_event_processor():
    """FastAPI shutdown 调用，毒药药丸停机"""
    global _consumer_task, _queue
    if _consumer_task and _queue is not None:
        logger.info("事件处理器停机中...")
        await _queue.put(None)  # 毒药药丸
        await _consumer_task
        _consumer_task = None
        logger.info("事件处理器已停止")


def enqueue_event(content: str, event_type: str,
                  character_id: str = "", session_id: str = "",
                  source_id: str = "", campaign_id: str = "",
                  metadata: dict = None) -> bool:
    """非阻塞入队（保留向后兼容，旧调用方继续使用）。

    Args:
        content: 待提取的文本（日记/梦境叙事/RPG 事件摘要）
        event_type: 事件类型（"diary" / "dream" / "rpg"）
        character_id: 归属角色
        session_id: 会话 ID
        source_id: 来源标识（note_id / dream_id / event_id）
        campaign_id: 跑团模式下传，关系写入跑团隔离图谱；不传则写入全局 knowledge
        metadata: 扩展字段

    Returns:
        True 入队成功，False 队列未初始化或已满
    """
    if _queue is None:
        logger.debug("事件处理器未初始化，跳过事件")
        return False
    try:
        _queue.put_nowait({
            "content": content,
            "event_type": event_type,
            "character_id": character_id,
            "session_id": session_id,
            "source_id": source_id,
            "campaign_id": campaign_id,
            "metadata": metadata or {},
        })
        logger.debug(f"事件已入队: {event_type} ({content[:60]})")
        return True
    except asyncio.QueueFull:
        logger.warning(f"事件队列已满，丢弃: {event_type}")
        return False


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
