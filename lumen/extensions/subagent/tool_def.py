"""
subagent_call 工具定义 + 模式分发

支持：
- 执行模式: Single / Chain / Parallel / Fanout
- 异步模式: async=true 后台运行
- 管理模式: action=status/list/resume/skills

深度防护：contextvars 追踪嵌套层级。
"""

import contextvars
import logging
from typing import Any, Dict

from lumen.types.tools import ErrorCode, success_result, error_result

logger = logging.getLogger(__name__)

# 子代理调用深度追踪
_SUBAGENT_DEPTH: contextvars.ContextVar[int] = contextvars.ContextVar(
    "_subagent_depth", default=0
)
MAX_SUBAGENT_DEPTH = 2

TOOL_DEFINITION = {
    "description": (
        "调用子代理完成子任务。支持四种模式：\n"
        "• Single: { agent, task } — 单个子代理\n"
        "• Chain: { chain: [{agent, task}, ...] } — 串行管道\n"
        "• Parallel: { tasks: [{agent, task}, ...] } — 并发执行\n"
        "• Fanout: { fanout: \"任务描述\" } — 先分析拆分，再并发执行\n"
        "• 管理: { action: \"status\"|\"list\"|\"resume\"|\"skills\" } — 查看状态/技能\n"
        "可用 agent: scout(侦察), reviewer(审查), worker(通用)\n"
        "可用 skills: code_review, research, summarize, refactor"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "description": "管理操作: status(查看状态), list(列出任务), resume(恢复会话), skills(列出技能)",
                "enum": ["status", "list", "resume", "skills"],
            },
            "id": {
                "type": "string",
                "description": "异步任务 ID（action=status 时使用）",
            },
            "agent": {
                "type": "string",
                "description": "Agent 名称（Single 模式）",
            },
            "task": {
                "type": "string",
                "description": "任务描述（Single 模式）",
            },
            "skills": {
                "type": "array",
                "description": "注入的技能名称列表（如 code_review, research）",
                "items": {"type": "string"},
            },
            "chain": {
                "type": "array",
                "description": "Chain 模式步骤列表",
                "items": {
                    "type": "object",
                    "properties": {
                        "agent": {"type": "string"},
                        "task": {"type": "string"},
                    },
                    "required": ["agent"],
                },
            },
            "tasks": {
                "type": "array",
                "description": "Parallel 模式任务列表（最多 4 个）",
                "items": {
                    "type": "object",
                    "properties": {
                        "agent": {"type": "string"},
                        "task": {"type": "string"},
                    },
                    "required": ["agent", "task"],
                },
            },
            "concurrency": {
                "type": "integer",
                "description": "Parallel 模式最大并发数（默认 2）",
            },
            "async": {
                "type": "boolean",
                "description": "是否异步执行（默认 false）",
            },
            "fanout": {
                "type": "string",
                "description": "Fanout 模式：先分析拆分任务，再并发执行（值为任务描述）",
            },
            "max_fanout": {
                "type": "integer",
                "description": "Fanout 模式最大子任务数（默认 4）",
            },
        },
    },
}


def _detect_mode(params: dict) -> str:
    """检测执行模式"""
    if params.get("action"):
        return "management"
    if params.get("fanout"):
        return "fanout"
    if params.get("chain"):
        return "chain"
    if params.get("tasks"):
        return "parallel"
    if params.get("agent"):
        return "single"
    return "single"


async def execute(params: Dict[str, Any], command: str = "") -> Dict[str, Any]:
    """执行子代理调用（含深度防护 + 模式分发）"""
    mode = _detect_mode(params)

    # 管理模式不需要深度检查
    if mode == "management":
        return await _execute_management(params)

    # 深度检查
    current_depth = _SUBAGENT_DEPTH.get()
    if current_depth >= MAX_SUBAGENT_DEPTH:
        return error_result(
            "subagent_call",
            ErrorCode.EXEC_FAILED,
            f"子代理嵌套深度超限 (depth={current_depth}, max={MAX_SUBAGENT_DEPTH})。",
        )

    task = params.get("task", "")

    # Single 模式校验
    if mode == "single" and not task:
        return error_result("subagent_call", ErrorCode.PARAM_TYPE, "Single 模式需要 task 参数")

    # 异步模式
    if params.get("async") and mode == "single":
        return await _execute_async(params)

    # 设置深度 + 同步执行
    token = _SUBAGENT_DEPTH.set(current_depth + 1)
    try:
        if mode == "fanout":
            return await _execute_fanout(params)
        elif mode == "chain":
            return await _execute_chain(params)
        elif mode == "parallel":
            return await _execute_parallel(params)
        else:
            return await _execute_single(params)
    except Exception as e:
        logger.error(f"SubAgent 执行失败: {e}")
        return error_result("subagent_call", ErrorCode.EXEC_FAILED, str(e))
    finally:
        _SUBAGENT_DEPTH.reset(token)


async def _execute_management(params: Dict[str, Any]) -> Dict[str, Any]:
    """管理模式执行"""
    from .async_runner import get_status, list_active_runs
    from .session import list_sessions, get_session_summary

    action = params.get("action", "")

    if action == "list":
        runs = list_active_runs()
        sessions = list_sessions(10)
        return success_result("subagent_call", data={
            "active_runs": runs,
            "recent_sessions": sessions,
        })

    if action == "status":
        run_id = params.get("id", "")
        if not run_id:
            return error_result("subagent_call", ErrorCode.PARAM_TYPE, "需要 id 参数")

        # 先查异步任务
        status = get_status(run_id)
        if status:
            return success_result("subagent_call", data=status)

        # 再查会话记录
        summary = get_session_summary(run_id)
        if summary:
            return success_result("subagent_call", data=summary)

        return error_result("subagent_call", ErrorCode.EXEC_FAILED, f"任务 {run_id} 不存在")

    if action == "resume":
        run_id = params.get("id", "")
        message = params.get("task", "")
        if not run_id:
            return error_result("subagent_call", ErrorCode.PARAM_TYPE, "需要 id 参数")

        from .execution import resume_single
        result = await resume_single(run_id, follow_up=message)
        if not result:
            return error_result("subagent_call", ErrorCode.EXEC_FAILED, f"会话 {run_id} 不存在或无法恢复")

        data = {
            "output": result["output"],
            "mode": "resume",
            "resumed_from": run_id,
            "new_run_id": result["run_id"],
            "tool_calls": result["tool_calls"],
            "iterations": result["iterations"],
        }
        if result.get("truncated"):
            data["truncated"] = True
            data["output_file"] = result["output_file"]
            data["full_length"] = result["full_length"]

        return success_result("subagent_call", data=data)

    if action == "skills":
        from .skill_loader import list_skills
        skills = list_skills()
        return success_result("subagent_call", data={
            "skills": skills,
            "count": len(skills),
        })

    return error_result("subagent_call", ErrorCode.PARAM_TYPE, f"未知操作: {action}")


async def _execute_async(params: Dict[str, Any]) -> Dict[str, Any]:
    """异步执行 Single 模式"""
    from .async_runner import start_async

    agent_name = params.get("agent", "worker")
    task = params.get("task", "")
    context = params.get("context", "")
    skills = params.get("skills", [])

    result = await start_async(
        task=task,
        agent_name=agent_name,
        context=context,
        skills=skills,
    )

    return success_result("subagent_call", data={
        "mode": "async",
        "run_id": result["run_id"],
        "status": result["status"],
        "agent": result["agent"],
        "message": f"异步任务已启动。使用 action=\"status\", id=\"{result['run_id']}\" 查看状态。",
    })


async def _execute_single(params: Dict[str, Any]) -> Dict[str, Any]:
    """Single 模式执行"""
    from .agent_config import get_agent, AgentConfig
    from .execution import run_single

    agent_name = params.get("agent", "worker")
    task = params.get("task", "")
    context = params.get("context", "")
    skills = params.get("skills", [])

    agent = get_agent(agent_name)
    if not agent:
        agent = AgentConfig(name=agent_name, description=f"Agent: {agent_name}")

    result = await run_single(task=task, agent=agent, context=context, skills=skills)

    data = {
        "output": result["output"],
        "agent": agent_name,
        "mode": "single",
        "tool_calls": result["tool_calls"],
        "iterations": result["iterations"],
        "run_id": result.get("run_id", ""),
    }
    if result.get("truncated"):
        data["truncated"] = True
        data["output_file"] = result["output_file"]
        data["full_length"] = result["full_length"]
        data["message"] = f"输出已截断（{result['full_length']} 字符）。完整输出: {result['output_file']}"

    return success_result("subagent_call", data=data)


async def _execute_chain(params: Dict[str, Any]) -> Dict[str, Any]:
    """Chain 模式执行"""
    from .chain import run_chain

    chain_steps = params.get("chain", [])
    task = params.get("task", "")
    skills = params.get("skills", [])

    if not chain_steps:
        return error_result("subagent_call", ErrorCode.PARAM_TYPE, "Chain 模式需要 chain 参数")

    result = await run_chain(steps=chain_steps, task=task, skills=skills)

    data = {
        "output": result["output"],
        "mode": "chain",
        "steps": result["steps"],
        "failed_at": result["failed_at"],
    }
    if result.get("truncated"):
        data["truncated"] = True
        data["output_file"] = result["output_file"]
        data["full_length"] = result["full_length"]

    return success_result("subagent_call", data=data)


async def _execute_parallel(params: Dict[str, Any]) -> Dict[str, Any]:
    """Parallel 模式执行"""
    from .parallel import run_parallel

    tasks = params.get("tasks", [])
    concurrency = params.get("concurrency", 2)
    skills = params.get("skills", [])

    if not tasks:
        return error_result("subagent_call", ErrorCode.PARAM_TYPE, "Parallel 模式需要 tasks 参数")

    result = await run_parallel(tasks=tasks, concurrency=concurrency, skills=skills)

    data = {
        "output": result["output"],
        "mode": "parallel",
        "results": result["results"],
        "success_count": result["success_count"],
        "fail_count": result["fail_count"],
    }
    if result.get("truncated"):
        data["truncated"] = True
        data["output_file"] = result["output_file"]
        data["full_length"] = result["full_length"]

    return success_result("subagent_call", data=data)


async def _execute_fanout(params: Dict[str, Any]) -> Dict[str, Any]:
    """Fanout 模式执行 — 先分析拆分，再并发执行"""
    from .fanout import run_fanout

    task = params.get("fanout", "")
    skills = params.get("skills", [])
    max_fanout = params.get("max_fanout", 4)

    if not task:
        return error_result("subagent_call", ErrorCode.PARAM_TYPE, "Fanout 模式需要 fanout 参数（任务描述）")

    result = await run_fanout(task=task, max_tasks=max_fanout, skills=skills)

    data = {
        "output": result["output"],
        "mode": "fanout",
        "subtasks": result["subtasks"],
        "results": result["results"],
        "analysis": result["analysis"],
        "success_count": result["success_count"],
        "fail_count": result["fail_count"],
    }
    if result.get("truncated"):
        data["truncated"] = True
        data["output_file"] = result["output_file"]
        data["full_length"] = result["full_length"]

    return success_result("subagent_call", data=data)
