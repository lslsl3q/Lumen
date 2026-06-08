"""
Parallel 执行 — 并发运行多个子代理任务
"""

import asyncio
import logging
import uuid
from typing import Any

from .agent_config import AgentConfig, get_agent
from .execution import run_single
from .output import manage_output

logger = logging.getLogger(__name__)

_MAX_PARALLEL_TASKS = 4
_DEFAULT_CONCURRENCY = 2


async def run_parallel(
    tasks: list[dict[str, str]],
    concurrency: int = _DEFAULT_CONCURRENCY,
    default_model: str = "",
    skills: list[str] | None = None,
) -> dict[str, Any]:
    """执行 Parallel 模式

    Args:
        tasks: [{"agent": "scout", "task": "Find auth code"}, {"agent": "scout", "task": "Find models"}]
        concurrency: 最大并发数
        default_model: 默认模型

    Returns:
        {"output": str, "results": list[dict], "success_count": int, "fail_count": int}
    """
    if len(tasks) > _MAX_PARALLEL_TASKS:
        return {
            "output": f"Too many parallel tasks: {len(tasks)} (max {_MAX_PARALLEL_TASKS})",
            "results": [],
            "success_count": 0,
            "fail_count": len(tasks),
        }

    concurrency = max(1, min(concurrency, len(tasks)))
    semaphore = asyncio.Semaphore(concurrency)

    async def run_one(index: int, task_def: dict[str, str]) -> dict[str, Any]:
        agent_name = task_def.get("agent", "worker")
        task_text = task_def.get("task", "")

        agent = get_agent(agent_name)
        if not agent:
            logger.warning(f"Parallel task {index+1}: agent '{agent_name}' not found, using worker")
            agent = AgentConfig(name=agent_name, description=f"Unknown agent: {agent_name}")

        async with semaphore:
            logger.info(f"Parallel task {index+1}/{len(tasks)}: agent={agent_name}")
            try:
                result = await run_single(
                    task=task_text,
                    agent=agent,
                    default_model=default_model,
                    skills=skills,
                )
                return {
                    "index": index + 1,
                    "agent": agent_name,
                    "status": "success",
                    "output": result["output"],
                    "tool_calls": result["tool_calls"],
                    "iterations": result["iterations"],
                }
            except Exception as e:
                logger.error(f"Parallel task {index+1} failed: {e}")
                return {
                    "index": index + 1,
                    "agent": agent_name,
                    "status": "failed",
                    "output": "",
                    "error": str(e),
                    "tool_calls": 0,
                    "iterations": 0,
                }

    # 并发执行所有任务
    results = await asyncio.gather(
        *[run_one(i, t) for i, t in enumerate(tasks)],
        return_exceptions=False,
    )

    success_count = sum(1 for r in results if r["status"] == "success")
    fail_count = sum(1 for r in results if r["status"] == "failed")

    # 拼接输出
    output_parts = []
    for r in results:
        status_icon = "✓" if r["status"] == "success" else "✗"
        output_parts.append(f"### [{status_icon}] Task {r['index']}: {r['agent']}")
        if r["output"]:
            output_parts.append(r["output"])
        elif r.get("error"):
            output_parts.append(f"Error: {r['error']}")
        output_parts.append("")

    combined = "\n".join(output_parts)
    parallel_id = f"parallel_{uuid.uuid4().hex[:8]}"
    om = manage_output(combined, parallel_id)

    return {
        "output": om["output"],
        "truncated": om["truncated"],
        "output_file": om["output_file"],
        "full_length": om["full_length"],
        "results": list(results),
        "success_count": success_count,
        "fail_count": fail_count,
    }
