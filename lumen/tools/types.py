"""
Lumen - 工具系统专用类型
ErrorCode 常量和 ToolDefinition 结构
"""

from typing import TypedDict, Any, Dict


class ErrorCode:
    """工具执行错误代码

    格式：类别.子类.具体错误
    """
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
