"""
子代理异步执行 — 后台运行 + 事件通知

使用 asyncio.create_task 在后台运行子代理，
完成后通过 HookBus 发送事件。
"""

import asyncio
import logging
import time
import uuid
from typing import Any

from .agent_config import AgentConfig, get_agent

logger = logging.getLogger(__name__)

# 活跃的异步任务
_active_runs: dict[str, dict[str, Any]] = {}
_run_lock = asyncio.Lock()


async def start_async(
    task: str,
    agent_name: str = "worker",
    context: str = "",
    default_model: str = "",
    skills: list[str] | None = None,
) -> dict[str, Any]:
    """启动异步子代理任务

    Returns:
        {"run_id": str, "status": "started", "agent": str}
    """
    run_id = uuid.uuid4().hex[:8]

    agent = get_agent(agent_name)
    if not agent:
        agent = AgentConfig(name=agent_name, description=f"Agent: {agent_name}")

    # 注册活跃任务
    async with _run_lock:
        _active_runs[run_id] = {
            "run_id": run_id,
            "status": "running",
            "agent": agent_name,
            "task": task[:200],
            "started_at": time.time(),
            "output": "",
            "tool_calls": 0,
            "iterations": 0,
            "error": None,
        }

    # 后台执行
    asyncio.create_task(_run_background(run_id, task, agent, context, default_model, skills))

    return {
        "run_id": run_id,
        "status": "started",
        "agent": agent_name,
    }


async def _run_background(
    run_id: str,
    task: str,
    agent: AgentConfig,
    context: str,
    default_model: str,
    skills: list[str] | None = None,
) -> None:
    """后台执行子代理任务"""
    from .execution import run_single

    try:
        result = await run_single(
            task=task,
            agent=agent,
            context=context,
            default_model=default_model,
            enable_session=True,
            skills=skills,
        )

        async with _run_lock:
            if run_id in _active_runs:
                _active_runs[run_id].update({
                    "status": "completed",
                    "output": result["output"],
                    "tool_calls": result["tool_calls"],
                    "iterations": result["iterations"],
                    "run_id_result": result.get("run_id", ""),
                    "session_file": result.get("session_file", ""),
                    "completed_at": time.time(),
                })

        # 发送完成事件
        await _emit_completion_event(run_id, result)

    except Exception as e:
        logger.error(f"Async subagent {run_id} failed: {e}")

        async with _run_lock:
            if run_id in _active_runs:
                _active_runs[run_id].update({
                    "status": "failed",
                    "error": str(e),
                    "completed_at": time.time(),
                })

        # 发送失败事件
        await _emit_failure_event(run_id, str(e))


async def _emit_completion_event(run_id: str, result: dict) -> None:
    """发送子代理完成事件"""
    try:
        from lumen.core.hook_bus import HookBus
        from lumen.core.hook_types import SubagentCompletePayload

        payload = SubagentCompletePayload(
            run_id=run_id,
            output=result.get("output", "")[:500],
            tool_calls=result.get("tool_calls", 0),
            iterations=result.get("iterations", 0),
        )
        await HookBus.get().emit("subagent.completed", payload)
    except Exception as e:
        logger.debug(f"Failed to emit subagent.completed event: {e}")


async def _emit_failure_event(run_id: str, error: str) -> None:
    """发送子代理失败事件"""
    try:
        from lumen.core.hook_bus import HookBus
        from lumen.core.hook_types import SubagentFailedPayload

        payload = SubagentFailedPayload(run_id=run_id, error=error)
        await HookBus.get().emit("subagent.failed", payload)
    except Exception as e:
        logger.debug(f"Failed to emit subagent.failed event: {e}")


def get_status(run_id: str) -> dict[str, Any] | None:
    """获取异步任务状态"""
    return _active_runs.get(run_id)


def list_active_runs() -> list[dict[str, Any]]:
    """列出所有活跃的异步任务"""
    return [
        {k: v for k, v in run.items() if k != "output"}  # 不返回完整输出
        for run in _active_runs.values()
    ]


async def cleanup_old_runs(max_age_seconds: int = 3600) -> int:
    """清理过期的异步任务记录"""
    now = time.time()
    cleaned = 0

    async with _run_lock:
        expired = [
            rid for rid, run in _active_runs.items()
            if run.get("status") in ("completed", "failed")
            and now - run.get("completed_at", 0) > max_age_seconds
        ]
        for rid in expired:
            del _active_runs[rid]
            cleaned += 1

    return cleaned
