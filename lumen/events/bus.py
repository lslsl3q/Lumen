"""
T22 事件总线 — 极简单例 pub/sub

无持久化，无分布式，无通配符匹配。
用于反思管道和其他心智引擎内部事件流转。
"""

import asyncio
import logging
from typing import Callable, Awaitable, Union

from lumen.events.schema import ReflectionEvent

logger = logging.getLogger(__name__)

Handler = Union[Callable[[ReflectionEvent], None], Callable[[ReflectionEvent], Awaitable[None]]]


class EventBus:
    """极简发布/订阅"""

    def __init__(self):
        self._handlers: dict[str, list[Handler]] = {}

    def subscribe(self, event_type: str, handler: Handler) -> None:
        """注册事件处理器"""
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    def publish(self, event: ReflectionEvent) -> None:
        """发布事件到所有匹配的处理器

        同步 handler 直接调用，异步 handler 尝试 create_task 分发。
        如果当前没有运行中的事件循环，异步 handler 会被跳过并记录警告。
        """
        event_type = f"reflection.{event.source_type.value}"
        handlers = self._handlers.get(event_type, [])

        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(handler(event))
                    except RuntimeError:
                        logger.warning(f"无运行中的事件循环，跳过异步 handler: {handler.__name__}")
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"事件处理器异常 ({handler.__name__}): {e}")


_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    """全局单例访问器"""
    global _bus
    if _bus is None:
        _bus = EventBus()
    return _bus
