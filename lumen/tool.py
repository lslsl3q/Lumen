"""
Lumen - 工具执行引擎
工具注册、执行、并行调度、结果格式化
"""

import json
import time
import asyncio
import threading
import importlib
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from lumen.types.tools import ToolResult, ErrorCode

logger = logging.getLogger(__name__)

# ========================================
# 工具执行上下文（线程安全）
# ========================================

_current_context = threading.local()


def set_tool_context(session_id: str = "", character_id: str = ""):
    """设置当前工具执行的上下文（在 query.py 调用 execute_tool 前设置）"""
    _current_context.session_id = session_id
    _current_context.character_id = character_id


def get_tool_context() -> Dict[str, str]:
    """获取当前工具执行的上下文"""
    return {
        "session_id": getattr(_current_context, "session_id", ""),
        "character_id": getattr(_current_context, "character_id", ""),
    }


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


def _format_data_readable(data: Any) -> str:
    """将工具返回的 data 字段格式化为可读文本（递归处理常见结构）"""
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        if not data:
            return "(无结果)"
        lines = []
        for i, item in enumerate(data, 1):
            if isinstance(item, dict):
                parts = [f"{k}: {v}" for k, v in item.items()]
                lines.append(f"{i}. {' | '.join(parts)}")
            else:
                lines.append(f"{i}. {item}")
        return "\n".join(lines)
    if isinstance(data, dict):
        return "\n".join(f"{k}: {v}" for k, v in data.items())
    # 复杂嵌套结构用缩进 JSON 兜底
    return json.dumps(data, ensure_ascii=False, indent=2)


def format_result_for_ai(result: Dict[str, Any], caller: str = "") -> str:
    """将工具结果格式化为 XML 格式发送给 AI

    XML 包裹让 AI 明确区分工具返回与用户消息，减少 token 消耗
    caller: 调用工具的角色名，帮助 AI 理解"这是我自己调的工具返回的结果"
    """
    tool = result["tool"]
    caller_attr = f' caller="{caller}"' if caller else ""

    if result["success"]:
        content = _format_data_readable(result["data"])
        return f'<tool_result tool="{tool}" status="success"{caller_attr}>\n{content}\n</tool_result>'

    error_code = result.get("error_code", "")
    error_msg = result.get("error_message", "未知错误")
    detail = result.get("error_detail")
    parts = [f"[{error_code}] {error_msg}"]
    if detail:
        parts.append(f"详情: {json.dumps(detail, ensure_ascii=False)}")
    content = "\n".join(parts)
    return f'<tool_result tool="{tool}" status="error"{caller_attr}>\n{content}\n</tool_result>'


# ========================================
# 工具注册表（名称 → 执行函数的映射）
# ========================================

_TOOL_HANDLERS: Dict[str, callable] = {}


def register_handler(name: str, handler: callable):
    """注册工具执行函数"""
    _TOOL_HANDLERS[name] = handler


def _load_builtin_tools():
    """自动加载工具：从 registry.json 读取工具名 → import 对应模块 → 注册 execute 函数"""
    from lumen.tools.registry import get_registry

    registry = get_registry()
    tool_names = registry.list_tools()

    for tool_name in tool_names:
        try:
            module = importlib.import_module(f"lumen.tools.{tool_name}")
            if hasattr(module, "execute"):
                register_handler(tool_name, module.execute)
                logger.info(f"自动注册工具: {tool_name}")
            else:
                logger.warning(f"工具 '{tool_name}' 模块中没有 execute 函数，跳过")
        except ImportError as e:
            logger.warning(f"工具 '{tool_name}' 导入失败: {e}")

    # 加载 MCP 外部工具
    _load_mcp_tools()


def _load_mcp_tools():
    """发现并注册 MCP 外部工具（后台线程加载，不阻塞事件循环）"""
    try:
        from lumen.services.mcp_client import discover_all_tools, execute_mcp_tool_sync

        async def _discover_and_register():
            tools = await discover_all_tools()
            for prefixed_name, tool_def in tools.items():
                register_handler(
                    prefixed_name,
                    lambda params, _name=prefixed_name: execute_mcp_tool_sync(_name, params),
                )
                from lumen.tools.registry import get_registry
                registry = get_registry()
                registry.register(prefixed_name, {
                    "description": tool_def.get("description", ""),
                    "parameters": tool_def.get("parameters", {"type": "object", "properties": {}}),
                })
                logger.info(f"注册 MCP 工具: {prefixed_name}")

        def _run():
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(_discover_and_register())
            except Exception as e:
                logger.warning(f"MCP 后台发现失败: {e}")
            finally:
                loop.close()

        import threading
        threading.Thread(target=_run, daemon=True, name="mcp-discovery").start()

    except Exception as e:
        logger.warning(f"MCP 工具加载失败（跳过）: {e}")


# ========================================
# 工具执行
# ========================================

def execute_tool(name: str, params: dict, command: str = "") -> Dict[str, Any]:
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
        result = handler(params, command=command)
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
                future = executor.submit(execute_tool, call["tool"], call.get("params", {}), call.get("command", ""))
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
