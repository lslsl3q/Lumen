"""
T22 事件总线 Schema — 反思管道的消息类型

与 lumen/types/events.py（SSE 流式事件）隔离。
这是后端心智引擎内部流转的事件类型。
"""

from enum import Enum
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """事件来源类型 — 反思 Agent 面对的五种异构数据源"""
    CHAT_MESSAGE = "chat_message"        # 原始聊天消息（下钻时用）
    DIARY_ENTRY = "diary_entry"          # 日记条目
    TOOL_RESULT = "tool_result"          # ReAct 工具调用结果链
    DOCUMENT_IMPORT = "document_import"  # 知识库导入的文档
    STATE_CHANGE = "state_change"        # 跑团 DM 裁决或角色状态变更


class ReflectionTrigger(str, Enum):
    """下钻触发原因"""
    EMOTIONAL_THRESHOLD = "emotional_threshold"       # Trigger 1: SimHash 情感门控
    LOGICAL_CONTRADICTION = "logical_contradiction"    # Trigger 2: LLM 检测到矛盾
    HIGH_FREQ_UNKNOWN = "high_freq_unknown"            # Trigger 3: LLM 标注未知实体
    MANUAL = "manual"                                   # Admin API 手动触发


class ReflectionEvent(BaseModel):
    """统一反思事件 — 所有异构数据源在送入反思 Agent 前包装为此类型"""
    source_type: SourceType
    timestamp: float = Field(description="epoch seconds")
    content: str = Field(default="", description="原始文本或摘要")
    summary: str = Field(default="", description="前 200 字符摘要")
    related_entities: list[str] = Field(default_factory=list)
    session_id: str = ""
    character_id: str = ""
    source_id: str = Field(default="", description="note_id / file_id / message_id")
    metadata: dict = Field(default_factory=dict, description="扩展字段")
