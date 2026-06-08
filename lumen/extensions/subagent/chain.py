"""
Chain 执行 — 串行管道，每步的输出成为下一步的 {previous}
"""

import logging
import uuid
from typing import Any

from .agent_config import AgentConfig, get_agent
from .execution import run_single
from .output import manage_output

logger = logging.getLogger(__name__)

_MAX_CHAIN_STEPS = 8


async def run_chain(
    steps: list[dict[str, str]],
    task: str = "",
    default_model: str = "",
    skills: list[str] | None = None,
) -> dict[str, Any]:
    """执行 Chain 模式

    Args:
        steps: [{"agent": "scout", "task": "Analyze {task}"}, {"agent": "worker", "task": "Implement based on {previous}"}]
        task: 原始任务（替换 {task} 占位符）
        default_model: 默认模型

    Returns:
        {"output": str, "steps": list[dict], "failed_at": int | None}
    """
    if len(steps) > _MAX_CHAIN_STEPS:
        return {
            "output": f"Chain too long: {len(steps)} steps (max {_MAX_CHAIN_STEPS})",
            "steps": [],
            "failed_at": 0,
        }

    results: list[dict[str, Any]] = []
    previous_output = ""

    for i, step in enumerate(steps):
        agent_name = step.get("agent", "worker")
        task_template = step.get("task", "{previous}")

        # 替换占位符
        actual_task = task_template
        actual_task = actual_task.replace("{task}", task)
        actual_task = actual_task.replace("{previous}", previous_output)

        # 如果第一步没有 task 也没有 {previous}，用原始 task
        if i == 0 and "{previous}" not in task_template and not task_template.strip():
            actual_task = task

        # 获取 agent 配置
        agent = get_agent(agent_name)
        if not agent:
            logger.warning(f"Chain step {i+1}: agent '{agent_name}' not found, using worker")
            agent = AgentConfig(name=agent_name, description=f"Unknown agent: {agent_name}")

        logger.info(f"Chain step {i+1}/{len(steps)}: agent={agent_name}")

        result = await run_single(
            task=actual_task,
            agent=agent,
            default_model=default_model,
            skills=skills,
        )

        step_result = {
            "step": i + 1,
            "agent": agent_name,
            "output": result["output"],
            "tool_calls": result["tool_calls"],
            "iterations": result["iterations"],
        }
        results.append(step_result)

        # 检查是否有输出
        if not result["output"].strip():
            return {
                "output": f"Chain stopped at step {i+1} ({agent_name}): no output",
                "steps": results,
                "failed_at": i + 1,
            }

        previous_output = result["output"]

    # 返回最后一步的输出
    final_output = results[-1]["output"] if results else ""
    chain_id = f"chain_{uuid.uuid4().hex[:8]}"
    om = manage_output(final_output, chain_id)

    return {
        "output": om["output"],
        "truncated": om["truncated"],
        "output_file": om["output_file"],
        "full_length": om["full_length"],
        "steps": results,
        "failed_at": None,
    }
