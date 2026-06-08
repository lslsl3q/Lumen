"""
Event Bridge 扩展 — 内容事件 → 图谱提取的桥接

从 core/event_processor.py 迁移而来。
把 HookBus 订阅逻辑从 core 层移到 extensions 层，保持 core/ 干净。

双重异常隔离：
1. 扩展内部 try-except 捕获 enqueue_event 异常
2. HookBus.emit() 本身也隔离 handler 异常（兜底）
"""

import logging

logger = logging.getLogger(__name__)


def register(bus) -> None:
    """注册内容创建和 RPG 动作事件的图谱提取桥接"""
    from lumen.services.event_queue import enqueue_event

    async def _on_content_created(payload) -> None:
        """content.created → enqueue_event"""
        try:
            enqueue_event(
                content=payload.content,
                event_type=payload.content_type,
                character_id=payload.character_id,
                session_id=payload.session_id,
                source_id=payload.source_id,
                campaign_id=payload.campaign_id,
            )
        except Exception as e:
            logger.error(f"event_bridge content.created failed: {e}")

    async def _on_rpg_action_completed(payload) -> None:
        """rpg.action.completed → 自动提取图谱"""
        try:
            if payload.result_text:
                enqueue_event(
                    content=payload.result_text,
                    event_type="rpg",
                    character_id=payload.actor_id,
                    source_id=f"rpg_{payload.actor_id}",
                    campaign_id=payload.room_id,
                )
        except Exception as e:
            logger.error(f"event_bridge rpg.action.completed failed: {e}")

    bus.register(
        "content.created",
        _on_content_created,
        priority=50,
        name="ext.event_bridge.on_content_created",
    )
    bus.register(
        "rpg.action.completed",
        _on_rpg_action_completed,
        priority=95,  # 在 PlotEngine(80) 之后执行
        name="ext.event_bridge.on_rpg_action",
    )

    logger.info("EventBridge extension: registered content/rpg event handlers")


def unregister(bus) -> None:
    """热重载清理"""
    bus.unregister("content.created", "ext.event_bridge.on_content_created")
    bus.unregister("rpg.action.completed", "ext.event_bridge.on_rpg_action")
    logger.info("EventBridge extension: unregistered handlers")
