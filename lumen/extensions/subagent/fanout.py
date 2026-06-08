"""
Dynamic Fanout — 先分析拆分，再并发执行

流程：
1. 分析 Agent 将任务拆分为结构化子任务列表
2. 每个子任务分配给指定 Agent 并发执行
3. 合并所有结果
"""

import json
import logging
from typing import Any

from .agent_config import AgentConfig, get_agent
from .execution import run_single
from .parallel import run_parallel

logger = logging.getLogger(__name__)

_MAX_FANOUT_TASKS = 4

_ANALYZER_PROMPT = """You are a task analyzer. Your job is to break down a complex task into independent subtasks that can be executed in parallel.

Output a JSON array of subtasks. Each subtask has:
- "agent": which agent should handle it (from available agents)
- "task": clear, specific task description

Rules:
- Maximum {max_tasks} subtasks
- Each subtask must be independently executable (no dependencies between them)
- Be specific — each subtask should have a clear success criteria
- Use the most appropriate agent for each subtask

Available agents:
{agent_list}

Output ONLY the JSON array, no explanation. Example:
[
  {{"agent": "scout", "task": "Find all authentication-related code"}},
  {{"agent": "worker", "task": "Write unit tests for the auth module"}}
]"""


async def run_fanout(
    task: str,
    analyzer_agent: str = "worker",
    default_model: str = "",
    max_tasks: int = _MAX_FANOUT_TASKS,
    skills: list[str] | None = None,
) -> dict[str, Any]:
    """执行 Dynamic Fanout 模式

    Args:
        task: 高级任务描述
        analyzer_agent: 负责分析拆分的 agent 名称
        default_model: 默认模型
        max_tasks: 最大子任务数
        skills: 注入的技能

    Returns:
        {"output": str, "subtasks": list, "results": dict, "analysis": str}
    """
    from .agent_config import discover_agents

    # 获取可用 agent 列表
    agents = discover_agents()
    agent_list = "\n".join(
        f"- {a.name}: {a.description}" for a in agents
    ) or "- worker: General-purpose agent"

    # 构建分析 prompt
    analysis_prompt = _ANALYZER_PROMPT.format(
        max_tasks=max_tasks,
        agent_list=agent_list,
    )

    # Step 1: 分析任务，获取子任务列表
    base = get_agent(analyzer_agent)
    if base:
        analyzer = AgentConfig(
            name=base.name, description=base.description,
            model=base.model, tools=base.tools,
            max_depth=base.max_depth, source=base.source,
            system_prompt=analysis_prompt,
        )
    else:
        analyzer = AgentConfig(name=analyzer_agent, description="Task analyzer", system_prompt=analysis_prompt)

    analysis_result = await run_single(
        task=f"Break down this task into subtasks:\n\n{task}",
        agent=analyzer,
        default_model=default_model,
        enable_session=False,
        skills=[],
    )

    analysis_output = analysis_result.get("output", "")

    # 解析子任务列表
    subtasks = _parse_subtasks(analysis_output, max_tasks)

    if not subtasks:
        return {
            "output": f"Failed to parse subtasks from analysis.\n\nAnalysis output:\n{analysis_output}",
            "subtasks": [],
            "results": [],
            "analysis": analysis_output,
            "success_count": 0,
            "fail_count": 0,
        }

    # Step 2: 并发执行子任务
    logger.info(f"Fanout: {len(subtasks)} subtasks extracted, executing in parallel")

    result = await run_parallel(
        tasks=subtasks,
        concurrency=min(len(subtasks), max_tasks),
        default_model=default_model,
        skills=skills,
    )

    return {
        "output": result["output"],
        "subtasks": subtasks,
        "results": result["results"],
        "analysis": analysis_output,
        "success_count": result["success_count"],
        "fail_count": result["fail_count"],
        "truncated": result.get("truncated", False),
        "output_file": result.get("output_file", ""),
        "full_length": result.get("full_length", 0),
    }


def _parse_subtasks(output: str, max_tasks: int) -> list[dict[str, str]]:
    """从分析输出中解析子任务列表"""
    # 尝试提取 JSON 数组
    text = output.strip()

    # 尝试直接解析
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return _validate_subtasks(data, max_tasks)
    except json.JSONDecodeError:
        pass

    # 尝试从 markdown 代码块中提取
    if "```" in text:
        parts = text.split("```")
        for i, part in enumerate(parts):
            if i % 2 == 1:  # 代码块内容
                # 去掉可能的语言标记
                if part.startswith("json\n"):
                    part = part[5:]
                elif part.startswith("JSON\n"):
                    part = part[5:]
                try:
                    data = json.loads(part.strip())
                    if isinstance(data, list):
                        return _validate_subtasks(data, max_tasks)
                except json.JSONDecodeError:
                    continue

    # 尝试找第一个 [ 到最后一个 ]
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start:end + 1])
            if isinstance(data, list):
                return _validate_subtasks(data, max_tasks)
        except json.JSONDecodeError:
            pass

    return []


def _validate_subtasks(data: list, max_tasks: int) -> list[dict[str, str]]:
    """验证并清理子任务列表"""
    valid = []
    for item in data[:max_tasks]:
        if not isinstance(item, dict):
            continue
        agent = item.get("agent", "worker")
        task = item.get("task", "")
        if task:
            valid.append({"agent": agent, "task": task})
    return valid
