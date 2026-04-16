"""
Lumen - 工具执行引擎
结果格式化（Pydantic 校验）、工具分发、并行执行
"""

import json
import time
from datetime import datetime
from typing import List, Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from lumen.tools.types import ErrorCode  # 保留此导入：calculate.py 和 web_search.py 通过 base.py 间接导入 ErrorCode
from lumen.types.tools import ToolResult


# ========================================
# 返回值辅助函数（Pydantic 校验 → 返回 dict）
# ========================================

def success_result(tool: str, data: Any, **metadata) -> Dict[str, Any]:
    """构造成功结果（Pydantic 校验后返回 dict）"""
    result = ToolResult(
        success=True,
        tool=tool,
        data=data,
        timestamp=datetime.now().isoformat(),
        **metadata,
    )
    return result.model_dump(exclude_none=True)


def error_result(tool: str, code: str, message: str, detail: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """构造错误结果（Pydantic 校验后返回 dict）"""
    result = ToolResult(
        success=False,
        tool=tool,
        error_code=code,
        error_message=message,
        timestamp=datetime.now().isoformat(),
        error_detail=detail,
    )
    return result.model_dump(exclude_none=True)


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

_TOOL_HANDLERS: Dict[str, callable] = {}


def register_handler(name: str, handler: callable):
    """注册工具执行函数"""
    _TOOL_HANDLERS[name] = handler


def _load_builtin_tools():
    """加载内置工具（延迟导入，避免循环依赖）"""
    from lumen.tools.calculate import execute as exec_calc
    register_handler("calculate", exec_calc)

    from lumen.tools.web_search import execute as exec_search
    register_handler("web_search", exec_search)


# ========================================
# 工具执行
# ========================================

def execute_tool(name: str, params: dict) -> Dict[str, Any]:
    """执行工具调用，返回标准化结果"""
    start_time = time.perf_counter()

    if not isinstance(params, dict):
        return error_result(
            name,
            ErrorCode.PARAM_TYPE,
            f"参数必须是字典类型，收到: {type(params).__name__}",
        )

    if not _TOOL_HANDLERS:
        _load_builtin_tools()

    handler = _TOOL_HANDLERS.get(name)
    if handler:
        result = handler(params)
        if "execution_time" not in result:
            result["execution_time"] = round((time.perf_counter() - start_time) * 1000, 2)
        return result

    return error_result(
        name,
        ErrorCode.TOOL_UNKNOWN,
        f"未知工具: {name}",
    )


def execute_tools_parallel(calls: List[Dict], max_workers: int = 5, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
    """并发执行多个工具调用"""
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
