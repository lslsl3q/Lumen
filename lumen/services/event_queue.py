"""
事件队列 — 事件入队的统一入口

基础设施层：services/tools/core 均可安全导入。
底层模块（services、tools）需要触发图谱提取时，调用 enqueue_event()，
不需要知道谁消费、怎么消费。core/event_processor.py 是实际消费者。
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_queue: Optional[asyncio.Queue] = None


def init_event_queue(maxsize: int = 100):
    """初始化事件队列（FastAPI startup 时调用）"""
    global _queue
    if _queue is None:
        _queue = asyncio.Queue(maxsize=maxsize)


def get_event_queue() -> Optional[asyncio.Queue]:
    """获取事件队列实例（供消费者使用）"""
    return _queue


def enqueue_event(content: str, event_type: str,
                  character_id: str = "", session_id: str = "",
                  source_id: str = "", campaign_id: str = "",
                  metadata: dict = None) -> bool:
    """非阻塞入队。

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
        logger.debug("事件队列未初始化，跳过事件")
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
