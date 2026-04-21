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


class RecalledMessage(TypedDict):
    """召回的单条历史消息"""
    role: str          # "user" | "assistant"
    content: str       # 消息内容（截断到500字符）
    session_id: str    # 来源会话ID
    created_at: str    # 时间戳


class RecallLogEntry(TypedDict):
    """单个关键词的召回记录"""
    keyword: str       # 搜索关键词
    source: str        # "sqlite" | "summary"
    results: int       # 命中结果数
    tokens: int        # 消耗的 token 数
    messages: list     # list[RecalledMessage]


class MemoryDebugEvent(TypedDict, total=False):
    """记忆调试事件 — /medebug 命令开启后 yield"""
    type: str          # "memory_debug"
    layers: list       # list[MemoryDebugLayer]
    total_tokens: int  # 总 token 数
    context_size: int  # 角色的上下文窗口大小
    recall_log: list   # list[RecallLogEntry]


class ReactTraceStep(TypedDict, total=False):
    """ReAct 循环单步追踪"""
    type: str          # "react_trace"
    iteration: int     # 第几轮（0-based）
    action: str        # "thinking" | "tool_call" | "tool_result" | "response" | "error" | "cancelled"
    tool: str          # 工具名（action=tool_call/tool_result 时）
    params: dict       # 工具参数（action=tool_call 时）
    success: bool      # 执行结果（action=tool_result 时）
    duration_ms: float # 耗时（毫秒，action=tool_call/tool_result/thinking 时）
    thinking: str      # AI 在工具调用前的文字（action=tool_call 时）
    error: str         # 错误信息（action=error 时）
    exit_reason: str   # 结束原因（action=response 时）


# chat_stream 的 yield 类型
SSEEvent = Union[TextEvent, DoneEvent, ToolStartEvent, ToolResultEvent, StatusEvent, MemoryDebugEvent, ReactTraceStep]
