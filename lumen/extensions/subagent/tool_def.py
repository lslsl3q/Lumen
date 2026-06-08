"""
subagent_call 工具定义 + 执行器

深度防护机制（学 Pi 的 checkSubagentDepth）：
- 用 contextvars 追踪嵌套深度（异步安全）
- 超限时返回错误信息给 AI，不抛异常
"""

import contextvars
import logging

from lumen.types.tools import ErrorCode, success_result, error_result

logger = logging.getLogger(__name__)

# 子代理调用深度追踪（类似 Pi 的 PI_SUBAGENT_DEPTH 环境变量）
# contextvars 比 os.environ 更适合 Python 异步场景：
# 1. 每个 asyncio.Task 有独立上下文，并发请求互不干扰
# 2. reset(token) 确保异常时也能恢复
_SUBAGENT_DEPTH: contextvars.ContextVar[int] = contextvars.ContextVar(
    "_subagent_depth", default=0
)
MAX_SUBAGENT_DEPTH = 1  # MVP：只允许 1 层嵌套

TOOL_DEFINITION = {
    "description": (
        "调用子代理完成子任务。子代理拥有独立的上下文，完成后返回结果。"
        "子代理不能再调用子代理。适用于：信息查询、文本润色、翻译、"
        "事实核查等不需要工具的轻量任务。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "task": {
                "type": "string",
                "description": "子代理需要完成的任务描述",
            },
            "context": {
                "type": "string",
                "description": "传递给子代理的额外上下文信息（可选）",
            },
        },
        "required": ["task"],
    },
}


async def execute(params: dict, command: str = "") -> dict:
    """执行子代理调用（含深度防护）"""
    # 深度检查
    current_depth = _SUBAGENT_DEPTH.get()
    if current_depth >= MAX_SUBAGENT_DEPTH:
        return error_result(
            "subagent_call",
            ErrorCode.EXEC_FAILED,
            f"子代理嵌套深度超限 (depth={current_depth}, max={MAX_SUBAGENT_DEPTH})。"
            f"子代理不能再调用子代理，请直接完成任务。",
        )

    task = params.get("task", "")
    context_text = params.get("context", "")

    if not task:
        return error_result("subagent_call", ErrorCode.PARAM_TYPE, "缺少 task 参数")

    # 设置深度 + 执行
    token = _SUBAGENT_DEPTH.set(current_depth + 1)
    try:
        from .agent_runner import SubAgentRunner

        runner = SubAgentRunner()
        result = await runner.run(task, context=context_text)
        return success_result("subagent_call", data={"result": result})
    except Exception as e:
        logger.error(f"SubAgentRunner 执行失败: {e}")
        return error_result("subagent_call", ErrorCode.EXEC_FAILED, str(e))
    finally:
        _SUBAGENT_DEPTH.reset(token)
