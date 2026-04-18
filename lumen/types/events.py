"""
Lumen - SSE 事件类型定义
chat_stream yield 的事件形状，全部用 TypedDict（零开销，IDE 提示）
"""

from typing import TypedDict, Union, List, Optional, Any


class TextEvent(TypedDict):
    """文本片段事件"""
    type: str          # "text"
    content: str


class DoneEvent(TypedDict):
    """流式结束事件"""
    type: str          # "done"
    exit_reason: str   # "completed" | "completed_after_tools" | "max_iterations"


class ToolStartEvent(TypedDict, total=False):
    """工具开始执行事件"""
    type: str          # "tool_start"
    tool: Union[str, List[str]]  # 单个工具名或并行工具名列表
    params: dict       # 工具参数
    mode: str          # "parallel" 时存在


class ToolResultEvent(TypedDict, total=False):
    """工具执行结果事件"""
    type: str          # "tool_result"
    tool: str          # 工具名
    success: bool      # 是否成功
    data: Any          # 成功时的数据
    error: str         # 失败时的错误信息


class StatusEvent(TypedDict, total=False):
    """状态变化事件"""
    type: str          # "status"
    status: str        # "tool_error" | "max_iterations" 等
    message: str       # 状态详情


class MemoryDebugLayer(TypedDict):
    """记忆调试信息的一层"""
    name: str          # "角色元数据"、"世界书" 等
    tokens: int        # 该层的 token 数
    content: str       # 该层的完整内容


class MemoryDebugEvent(TypedDict, total=False):
    """记忆调试事件 — /tokens 命令开启后 yield"""
    type: str          # "memory_debug"
    layers: list       # list[MemoryDebugLayer]
    total_tokens: int  # 总 token 数
    context_size: int  # 角色的上下文窗口大小


# chat_stream 的 yield 类型
SSEEvent = Union[TextEvent, DoneEvent, ToolStartEvent, ToolResultEvent, StatusEvent, MemoryDebugEvent]
