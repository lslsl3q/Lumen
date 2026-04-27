"""
Lumen - 工具协议类型定义（Pydantic）
所有工具必须返回标准格式，用 Pydantic 强制校验
"""

from pydantic import BaseModel, ConfigDict
from typing import Any, Optional, List, Dict, Union, TypedDict


class ErrorCode:
    """工具执行错误代码"""

    # 参数错误
    PARAM_MISSING = "PARAM.MISSING"
    PARAM_INVALID = "PARAM.INVALID"
    PARAM_EMPTY = "PARAM.EMPTY"
    PARAM_TYPE = "PARAM.TYPE"

    # 执行错误
    EXEC_TIMEOUT = "EXEC.TIMEOUT"
    EXEC_FAILED = "EXEC.FAILED"
    EXEC_DENIED = "EXEC.DENIED"

    # 外部服务错误
    API_UNAVAILABLE = "API.UNAVAILABLE"
    API_RATE_LIMIT = "API.RATE_LIMIT"
    API_ERROR = "API.ERROR"

    # 工具错误
    TOOL_UNKNOWN = "TOOL.UNKNOWN"
    TOOL_BROKEN = "TOOL.BROKEN"


class ToolDefinition(TypedDict, total=False):
    """从 registry.json 加载的工具定义"""
    description: str
    parameters: Dict[str, Any]


class ToolResult(BaseModel):
    """工具执行结果 — 每个工具必须返回这个形状"""
    model_config = ConfigDict(extra="allow")  # 允许工具返回额外字段（如 execution_time）

    success: bool
    tool: str
    data: Any = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    timestamp: Optional[str] = None
    execution_time: Optional[float] = None
    error_detail: Optional[Dict[str, Any]] = None


class SingleToolCall(BaseModel):
    """解析出的单个工具调用"""
    model_config = ConfigDict(extra="allow")

    mode: str = "single"
    tool: str = ""
    command: str = ""
    params: Dict[str, Any] = {}
    call_id: Optional[str] = None
    run_in_background: Optional[bool] = None


class ParallelToolCall(BaseModel):
    """解析出的并行工具调用"""
    mode: str = "parallel"
    calls: List[Dict[str, Any]] = []
    call_id: Optional[str] = None


ParsedToolCall = Union[SingleToolCall, ParallelToolCall]
