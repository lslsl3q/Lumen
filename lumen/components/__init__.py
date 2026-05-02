"""
T24 components 包 — Concordia 风格可插拔组件
"""

from lumen.components.base import ContextComponent, ActingComponent, PromptZone
from lumen.components.identity import IdentityComponent
from lumen.components.lore import LoreComponent
from lumen.components.memory import MemoryComponent
from lumen.components.skills import SkillsComponent
from lumen.components.thinking_cluster import ThinkingClusterComponent
from lumen.components.tool import ToolComponent
from lumen.components.room_context import RoomContextComponent

__all__ = [
    "ContextComponent",
    "ActingComponent",
    "PromptZone",
    "IdentityComponent",
    "LoreComponent",
    "MemoryComponent",
    "SkillsComponent",
    "ThinkingClusterComponent",
    "ToolComponent",
    "RoomContextComponent",
]
