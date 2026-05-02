"""
Lumen Event Bus — 后端心智引擎内部事件流转

与 lumen/types/events.py（SSE 流式事件）隔离。
用于反思管道、GM 裁决链等多 Agent 内部通信。
"""

from lumen.events.schema import ReflectionEvent, SourceType, ReflectionTrigger
from lumen.events.bus import EventBus, get_event_bus

__all__ = [
    "ReflectionEvent",
    "SourceType",
    "ReflectionTrigger",
    "EventBus",
    "get_event_bus",
]
