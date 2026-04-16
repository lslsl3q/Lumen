"""
Lumen 类型定义 — 消息类型、事件、工具协议
"""

from lumen.types.messages import (
    MessageType,
    MessageMetadata,
    Message,
    FoldReason,
    create_message,
    create_tool_call_message,
    create_tool_result_message,
    create_tool_result_parallel_message,
    is_tool_call_message,
    is_tool_result_message,
    is_folded,
)

from lumen.types.events import (
    TextEvent,
    DoneEvent,
    ToolStartEvent,
    ToolResultEvent,
    StatusEvent,
    SSEEvent,
)

from lumen.types.tools import (
    ToolResult,
    SingleToolCall,
    ParallelToolCall,
    ParsedToolCall,
)
