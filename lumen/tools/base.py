"""
Lumen - 工具执行引擎
错误代码、结果格式化、工具分发、并行执行
"""

import json
import time
from datetime import datetime
from typing import List, Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed


# ========================================
# 错误代码定义
# ========================================

class ErrorCode:
    """工具执行错误代码

    格式：类别.子类.具体错误
    例如：PARAM.INVALID.VALUE, TIMEOUT.EXECUTION, API.RATE_LIMIT
    """

    # 参数错误
    PARAM_MISSING = "PARAM.MISSING"        # 缺少必需参数
    PARAM_INVALID = "PARAM.INVALID"        # 参数格式错误
    PARAM_EMPTY = "PARAM.EMPTY"            # 参数为空
    PARAM_TYPE = "PARAM.TYPE"              # 参数类型错误

    # 执行错误
    EXEC_TIMEOUT = "EXEC.TIMEOUT"          # 执行超时
    EXEC_FAILED = "EXEC.FAILED"            # 执行失败
    EXEC_DENIED = "EXEC.DENIED"            # 权限不足

    # 外部服务错误
    API_UNAVAILABLE = "API.UNAVAILABLE"    # 服务不可用
    API_RATE_LIMIT = "API.RATE_LIMIT"      # 速率限制
    API_ERROR = "API.ERROR"                # API 错误

    # 工具错误
    TOOL_UNKNOWN = "TOOL.UNKNOWN"          # 未知工具
    TOOL_BROKEN = "TOOL.BROKEN"            # 工具损坏


# ========================================
# 返回值辅助函数
# ========================================

def success_result(tool: str, data: Any, **metadata) -> Dict[str, Any]:
    """构造成功结果"""
    return {
        "success": True,
        "tool": tool,
        "data": data,
        "timestamp": datetime.now().isoformat(),
        **metadata
    }


def error_result(tool: str, code: str, message: str, detail: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """构造错误结果"""
    result = {
        "success": False,
        "tool": tool,
        "error_code": code,
        "error_message": message,
        "timestamp": datetime.now().isoformat()
    }
    if detail:
        result["error_detail"] = detail
    return result


def format_result_for_ai(result: Dict[str, Any]) -> str:
    """将工具结果格式化为适合发送给 AI 的字符串

    只包含关键信息，减少 token 消耗
    """
    tool = result["tool"]

    if result["success"]:
        data = result["data"]
        if isinstance(data, str):
            return f"[{tool}] {data}"
        else:
            return f"[{tool}] {json.dumps(data, ensure_ascii=False)}"
    else:
        return f"[{tool} 错误] {result['error_message']}"


# ========================================
# 工具注册表（名称 → 执行函数的映射）
# ========================================

# 每个工具模块注册自己的执行函数到这里
_TOOL_HANDLERS: Dict[str, callable] = {}


def register_handler(name: str, handler: callable):
    """注册工具执行函数

    Args:
        name: 工具名称
        handler: 执行函数，接收 (params: dict) 返回标准化结果
    """
    _TOOL_HANDLERS[name] = handler


def _load_builtin_tools():
    """加载内置工具（延迟导入，避免循环依赖）"""
    from lumen.tools.calculate import execute as exec_calc
    register_handler("calculate", exec_calc)


# ========================================
# 工具执行
# ========================================

def execute_tool(name: str, params: dict) -> Dict[str, Any]:
    """执行工具调用，返回标准化结果

    Args:
        name: 工具名称
        params: 工具参数

    Returns:
        标准化的结果字典
    """
    start_time = time.perf_counter()

    # 参数验证
    if not isinstance(params, dict):
        return error_result(
            name,
            ErrorCode.PARAM_TYPE,
            f"参数必须是字典类型，收到: {type(params).__name__}",
            {"received_type": type(params).__name__}
        )

    # 确保内置工具已加载
    if not _TOOL_HANDLERS:
        _load_builtin_tools()

    # 工具分发
    handler = _TOOL_HANDLERS.get(name)
    if handler:
        result = handler(params)
        # 补充执行时间（如果工具自己没算）
        if "execution_time" not in result:
            result["execution_time"] = round((time.perf_counter() - start_time) * 1000, 2)
        return result

    return error_result(
        name,
        ErrorCode.TOOL_UNKNOWN,
        f"未知工具: {name}",
        {"available_tools": list(_TOOL_HANDLERS.keys())}
    )


def execute_tools_parallel(calls: List[Dict], max_workers: int = 5, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
    """并发执行多个工具调用

    Args:
        calls: 工具调用列表，格式: [{"tool": "xxx", "params": {...}}, ...]
        max_workers: 最大并发线程数，默认为5
        timeout: 单个任务超时时间（秒），None表示不限制

    Returns:
        执行结果列表，每个元素都是 execute_tool 返回的标准化结果字典
    """
    if not calls:
        return []

    if not isinstance(calls, list):
        raise TypeError(f"calls 必须是列表类型，收到: {type(calls)}")

    for i, call in enumerate(calls):
        if not isinstance(call, dict):
            raise TypeError(f"calls[{i}] 必须是字典类型，收到: {type(call)}")
        if "tool" not in call:
            raise ValueError(f"calls[{i}] 缺少必需的 'tool' 字段")

    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {}
        for i, call in enumerate(calls):
            try:
                future = executor.submit(execute_tool, call["tool"], call.get("params", {}))
                future_to_index[future] = i
            except Exception as e:
                results.append(error_result(
                    call["tool"],
                    ErrorCode.EXEC_FAILED,
                    f"工具提交失败: {e}",
                    {"error_type": type(e).__name__}
                ))

        index_to_result = {}
        for future in as_completed(future_to_index):
            index = future_to_index[future]
            try:
                result = future.result(timeout=timeout)
                index_to_result[index] = result
            except TimeoutError:
                index_to_result[index] = error_result(
                    calls[index]["tool"],
                    ErrorCode.EXEC_TIMEOUT,
                    f"工具执行超时（{timeout}秒）"
                )
            except Exception as e:
                index_to_result[index] = error_result(
                    calls[index]["tool"],
                    ErrorCode.EXEC_FAILED,
                    f"工具执行异常: {type(e).__name__}: {e}"
                )

        for i, call in enumerate(calls):
            if i < len(results):
                continue
            if i in index_to_result:
                results.append(index_to_result[i])
            else:
                results.append(error_result(
                    call["tool"],
                    ErrorCode.EXEC_FAILED,
                    "未知错误"
                ))

    return results


# ========================================
# 从注册表生成工具提示词
# ========================================

def get_tool_prompt_from_registry(tool_names: List[str] = None) -> str:
    """从工具注册表生成工具提示词"""
    from lumen.tools.registry import get_registry

    registry = get_registry()
    tools_def = registry.get_tools(tool_names)

    if not tools_def:
        return ""

    tool_lines = []
    for name, definition in tools_def.items():
        params = definition.get("parameters", {}).get("properties", {})
        if params:
            param_parts = []
            for param_name, param_info in params.items():
                param_parts.append(f'"{param_name}": {param_info.get("description", param_name)}')
            params_text = "，参数: {" + ", ".join(param_parts) + "}"
        else:
            params_text = ""

        tool_lines.append(f'- {name}: {definition["description"]}{params_text}')

    tools_text = "\n".join(tool_lines)

    return f"""<tools>
你可以使用以下工具来帮助用户：
{tools_text}

在使用工具前，请先思考：
1. 用户的问题是否需要使用工具？
2. 如果需要，应该使用哪个（些）工具？
3. 这些工具之间是否有依赖关系？（后一个工具需要前一个的结果）
4. 工具的参数是否齐全？如果参数不齐全，请先询问用户。

当你需要使用工具时，请使用以下格式：

【单个工具调用】：
{{"type": "tool_call", "tool": "工具名", "params": {{"参数名": "参数值"}}}}

【多个工具并行】（多个工具互不依赖时，会被同时执行）：
{{"type": "tool_call_parallel", "calls": [
  {{"tool": "工具名1", "params": {{...}}}},
  {{"tool": "工具名2", "params": {{...}}}}
]}}

字段说明：
- type: 必填，消息类型（"tool_call" 或 "tool_call_parallel"）
- tool: 必填，工具名称
- params: 必填，工具参数（字典）
- id: 可选，调用ID（系统自动生成，一般不需要手动指定）

规则：
- 涉及数学计算时，必须使用 calculate 工具，不要自己计算
- 只有确实需要使用工具时才输出JSON，普通对话正常回复文字
- type 字段必须包含，否则工具调用会被忽略
- 不要在JSON前后加任何解释文字
- 如果多个工具有依赖关系，请分步调用单个工具
</tools>"""


def get_tool_prompt() -> str:
    """生成工具提示词（包含所有可用工具）"""
    return get_tool_prompt_from_registry(None)
