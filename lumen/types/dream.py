"""
T22 Step 4 深梦境系统类型定义

梦境调度器状态 + 涟漪召回 + 梦境运行结果。
与 lumen/types/reflection.py（Step 3 热反思）隔离。
"""

from pydantic import BaseModel, Field


class DreamState(BaseModel):
    """梦境调度器持久化状态（JSON 文件）"""
    last_trigger_time: float = 0.0
    last_trigger_id: str = ""
    diary_count_since_last: int = 0
    total_dreams: int = 0


class RippleEntry(BaseModel):
    """涟漪召回的单条记忆"""
    node_id: int = 0
    content: str = ""
    time_range: str = ""     # "recent" / "mid" / "deep"
    created_at: str = ""
    importance: int = 3


class DreamResult(BaseModel):
    """一次深梦境运行的完整结果"""
    dream_id: str
    character_id: str
    recalled_count: int = 0
    narrative: str = ""
    cards_generated: int = 0   # -1 = 已入队但卡片数待 Step 3 完成
    duration_ms: float = 0.0
