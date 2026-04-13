"""
Lumen - 工具系统
用 JSON Schema 定义工具，AI 通过输出 JSON 来调用
"""

import json
import re
import time
from datetime import datetime
from typing import List, Dict, Optional, Union, Any
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
    """构造成功结果

    Args:
        tool: 工具名称
        data: 返回数据
        **metadata: 额外元数据（如 execution_time, cached 等）

    Returns:
        标准化的成功结果字典
    """
    return {
        "success": True,
        "tool": tool,
        "data": data,
        "timestamp": datetime.now().isoformat(),
        **metadata
    }


def error_result(tool: str, code: str, message: str, detail: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """构造错误结果

    Args:
        tool: 工具名称
        code: 错误代码（使用 ErrorCode 类）
        message: 人类可读的错误信息
        detail: 详细错误信息（可选）

    Returns:
        标准化的错误结果字典
    """
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

    Args:
        result: execute_tool 返回的结果字典

    Returns:
        简化的字符串格式
    """
    tool = result["tool"]

    if result["success"]:
        # 成功：只显示工具名和数据
        data = result["data"]
        if isinstance(data, str):
            return f"[{tool}] {data}"
        else:
            return f"[{tool}] {json.dumps(data, ensure_ascii=False)}"
    else:
        # 失败：显示错误信息
        return f"[{tool} 错误] {result['error_message']}"


# ========================================
# 工具定义（JSON Schema 格式）
# ========================================

TOOL_DEFINITIONS = [
    {
        "name": "get_current_time",
        "description": "获取当前的日期、时间和星期",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "calculate",
        "description": "计算数学表达式的结果，支持加减乘除、幂运算、括号",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "数学表达式，例如 2+3*4 或 (100-20)/8"
                }
            },
            "required": ["expression"]
        }
    }
]


# ========================================
# 工具执行
# ========================================

def execute_tool(name: str, params: dict) -> Dict[str, Any]:
    """执行工具调用，返回标准化结果

    Args:
        name: 工具名称
        params: 工具参数

    Returns:
        标准化的结果字典：
        {
            "success": bool,
            "tool": str,
            "data": Any,
            "error_code": str | None,
            "error_message": str | None,
            "error_detail": dict | None,
            "execution_time": float,
            "timestamp": str
        }
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

    # 工具分发
    if name == "get_current_time":
        now = datetime.now()
        weekdays = ["一", "二", "三", "四", "五", "六", "日"]
        data = f"当前时间：{now.strftime('%Y年%m月%d日 %H:%M:%S')}，星期{weekdays[now.weekday()]}"

        return success_result(
            name,
            data,
            execution_time=round((time.perf_counter() - start_time) * 1000, 2)
        )

    elif name == "calculate":
        expression = params.get("expression", "")

        # 参数验证
        if not expression:
            return error_result(
                name,
                ErrorCode.PARAM_EMPTY,
                "没有提供数学表达式",
                {"provided_params": params}
            )

        # 使用 asteval 安全计算（支持三角函数、对数、统计等）
        # asteval 是一个安全的表达式求值库，使用 AST 解析，完全沙盒化
        try:
            from asteval import Interpreter
            evaluator = Interpreter()
            result = evaluator(expression)
            data = f"{expression} = {result}"

            return success_result(
                name,
                data,
                execution_time=round((time.perf_counter() - start_time) * 1000, 2)
            )
        except Exception as e:
            return error_result(
                name,
                ErrorCode.EXEC_FAILED,
                f"计算错误: {e}",
                {"expression": expression, "error_type": type(e).__name__}
            )

    else:
        return error_result(
            name,
            ErrorCode.TOOL_UNKNOWN,
            f"未知工具: {name}",
            {"available_tools": ["get_current_time", "calculate"]}
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
    # 输入验证
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
        # 提交所有任务，用索引关联
        future_to_index = {}
        for i, call in enumerate(calls):
            try:
                future = executor.submit(execute_tool, call["tool"], call.get("params", {}))
                future_to_index[future] = i
            except Exception as e:
                # 提交任务时异常，直接记录错误
                results.append(error_result(
                    call["tool"],
                    ErrorCode.EXEC_FAILED,
                    f"工具提交失败: {e}",
                    {"error_type": type(e).__name__}
                ))

        # 收集结果（按索引存储）
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

        # 按原始顺序返回结果
        for i, call in enumerate(calls):
            if i < len(results):
                # 提交时已失败的项，已经在 results 中了
                continue

            if i in index_to_result:
                results.append(index_to_result[i])
            else:
                # 不应该到这里
                results.append(error_result(
                    call["tool"],
                    ErrorCode.EXEC_FAILED,
                    "未知错误"
                ))

    return results


# ========================================
# 解析 AI 输出
# ========================================

def parse_tool_call(text: str):
    """尝试从 AI 回复中解析工具调用

    返回格式：
    - 单个工具: {"mode": "single", "tool": "xxx", "params": {...}}
    - 多个工具: {"mode": "parallel", "calls": [{"tool": "xxx", "params": {...}}, ...]}
    - 无工具调用: None
    """
    text = text.strip()

    def extract_json(text: str) -> Optional[dict]:
        """从文本中提取 JSON（支持嵌套花括号）"""
        # 尝试直接解析整个文本
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass

        # 找第一个 {，然后匹配对应的 }
        start_idx = text.find('{')
        if start_idx < 0:
            return None

        brace_count = 0
        in_string = False
        escape = False
        for i in range(start_idx, len(text)):
            char = text[i]

            if escape:
                escape = False
                continue
            if char == '\\':
                escape = True
                continue

            if char == '"':
                in_string = not in_string
                continue

            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_str = text[start_idx:i+1]
                        try:
                            return json.loads(json_str)
                        except (json.JSONDecodeError, ValueError):
                            pass
                        break
        return None

    data = extract_json(text)
    if not data or not isinstance(data, dict):
        return None

    # 多个工具并行格式
    if "calls" in data and isinstance(data["calls"], list):
        return {"mode": "parallel", "calls": data["calls"]}

    # 单个工具格式
    if "tool" in data:
        return {"mode": "single", "tool": data["tool"], "params": data.get("params", {})}

    return None


# ========================================
# 从注册表生成工具提示词（新方法）
# ========================================

def get_tool_prompt_from_registry(tool_names: List[str] = None) -> str:
    """
    从工具注册表生成工具提示词

    Args:
        tool_names: 工具名称列表，如果为 None 则包含所有工具

    Returns:
        工具提示词字符串
    """
    from tool_lib.registry import get_registry

    registry = get_registry()
    tools_def = registry.get_tools(tool_names)

    if not tools_def:
        return ""

    # 拼工具列表
    tool_lines = []
    for name, definition in tools_def.items():
        # 如果有参数，列出参数说明
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

当你需要使用工具时，请选择以下格式之一（不要混用）：

【单个工具】（只需要一个工具，或多个工具有依赖关系时）：
{{"tool": "工具名", "params": {{"参数名": "参数值"}}}}

【多个工具并行】（多个工具互不依赖时，会被同时执行）：
{{"calls": [
  {{"tool": "工具名1", "params": {{...}}}},
  {{"tool": "工具名2", "params": {{...}}}}
]}}

规则：
- 只有确实需要使用工具时才输出JSON，普通对话正常回复文字
- 一次只能调用一个工具 vs 并行调用多个工具：根据任务需要选择
- 不要在JSON前后加任何解释文字
- 如果多个工具有依赖关系（如：搜索结果需要被处理），请分步调用单个工具
</tools>"""


# ========================================
# 工具提示词生成（对外接口）
# ========================================

def get_tool_prompt() -> str:
    """生成工具提示词（包含所有可用工具）

    这是主要的对外接口，内部调用 get_tool_prompt_from_registry(None)
    返回包含所有工具定义和使用说明的提示词字符串
    """
    return get_tool_prompt_from_registry(None)
