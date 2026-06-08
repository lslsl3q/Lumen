"""
子代理执行器 — 单次执行（带 Lumen 原生工具调用循环 + 会话记录）

使用 Lumen 的 parse_tool_call() + execute_tool() 链路，
不依赖 OpenAI function calling。
"""

import json
import logging
import uuid
from typing import Any

from .agent_config import AgentConfig
from .output import manage_output

logger = logging.getLogger(__name__)

_MAX_TOOL_ITERATIONS = 8


async def run_single(
    task: str,
    agent: AgentConfig,
    context: str = "",
    default_model: str = "",
    enable_session: bool = True,
    skills: list[str] | None = None,
) -> dict[str, Any]:
    """执行单次子代理任务

    Args:
        task: 任务描述
        agent: Agent 配置
        context: 额外上下文
        default_model: 默认模型（agent.model 为空时使用）
        enable_session: 是否保存会话记录
        skills: 注入的技能名称列表

    Returns:
        {"output": str, "tool_calls": int, "iterations": int, "run_id": str, "session_file": str}
    """
    from lumen.services.llm import chat, build_thinking_params
    from lumen.config import get_model
    from lumen.tools.parse import parse_tool_call
    from lumen.tool import execute_tool
    from lumen.prompt.tool_prompt import get_tool_prompt_from_registry
    from . import session
    from .skill_loader import load_skills

    run_id = uuid.uuid4().hex[:8]
    session_file = ""

    if enable_session:
        session_file = session.create_session(run_id, agent.name, task, "single")

    model = agent.model or default_model or get_model()

    # systemPromptMode: append=追加到默认 prompt, replace=完全覆盖
    default_prompt = "你是子代理，完成分配的任务。直接给出结果。"
    if agent.system_prompt_mode == "append" and agent.system_prompt:
        system_prompt = f"{default_prompt}\n\n{agent.system_prompt}"
    else:
        system_prompt = agent.system_prompt or default_prompt

    # 构建工具提示词（如果 agent 配置了工具白名单）
    tool_prompt = ""
    if agent.tools:
        tool_prompt = get_tool_prompt_from_registry(agent.tools)

    # 构建技能注入
    skill_text = load_skills(skills) if skills else ""

    # 构建系统消息
    system_content = system_prompt
    if tool_prompt:
        system_content += f"\n\n{tool_prompt}"
    if skill_text:
        system_content += f"\n\n{skill_text}"

    # defaultReads: 自动读取文件内容注入到用户消息
    reads_content = ""
    if agent.default_reads:
        read_parts = []
        for filepath in agent.default_reads:
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    read_parts.append(f"### {filepath}\n{f.read()[:5000]}")
            except IOError:
                logger.warning(f"DefaultReads: cannot read {filepath}")
        if read_parts:
            reads_content = "\n\n".join(read_parts)

    # thinking: 构建思考参数
    thinking_extra = {}
    thinking_effort = None
    if agent.thinking:
        budget_map = {"high": 16000, "medium": 8000, "low": 2000}
        budget = budget_map.get(agent.thinking, 0)
        if budget:
            thinking_extra, thinking_effort = build_thinking_params(model, {
                "enabled": True,
                "budget_tokens": budget,
            })

    # 构建用户消息
    user_content = task
    if reads_content:
        user_content = f"参考文件：\n{reads_content}\n\n任务：{task}"
    elif context:
        user_content = f"上下文：\n{context}\n\n任务：{task}"

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]

    if enable_session:
        session.log_message(session_file, "system", system_content[:500])
        session.log_message(session_file, "user", user_content[:500])

    total_tool_calls = 0

    for iteration in range(_MAX_TOOL_ITERATIONS):
        response = await chat(
            messages=messages, model=model, stream=False,
            extra_body=thinking_extra or None,
            reasoning_effort=thinking_effort,
        )
        if not response or not response.choices:
            break

        content = response.choices[0].message.content or ""

        if enable_session:
            session.log_message(session_file, "assistant", content[:1000])

        # 用 Lumen 的解析器检查是否有工具调用
        tool_data, error = parse_tool_call(content)

        if not tool_data:
            # 没有工具调用，返回最终文本
            if enable_session:
                session.end_session(session_file, content, total_tool_calls, iteration + 1, True)
            om = manage_output(content, run_id)
            return {
                "output": om["output"],
                "truncated": om["truncated"],
                "output_file": om["output_file"],
                "full_length": om["full_length"],
                "tool_calls": total_tool_calls,
                "iterations": iteration + 1,
                "run_id": run_id,
                "session_file": session_file,
            }

        # 有工具调用，执行工具
        tool_name = tool_data.get("tool", "")
        tool_params = tool_data.get("params", {})
        tool_command = tool_data.get("command", "")

        # 检查工具是否在白名单中
        if agent.tools and tool_name not in agent.tools:
            error_msg = f"错误：工具 {tool_name} 不在可用工具列表中。可用工具：{', '.join(agent.tools)}"
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": error_msg})
            if enable_session:
                session.log_message(session_file, "system", error_msg)
            continue

        result = await execute_tool(tool_name, tool_params, command=tool_command)
        total_tool_calls += 1

        if enable_session:
            session.log_tool_call(session_file, tool_name, tool_params, result)

        # 把工具结果反馈给 LLM
        result_msg = f"工具 {tool_name} 的结果：\n{json.dumps(result, ensure_ascii=False)}"
        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": result_msg})

        if enable_session:
            session.log_message(session_file, "tool", result_msg[:1000])

    # 循环结束还没返回，最后调用一次拿纯文本
    response = await chat(
        messages=messages, model=model, stream=False,
        extra_body=thinking_extra or None,
        reasoning_effort=thinking_effort,
    )
    output = ""
    if response and response.choices:
        output = response.choices[0].message.content or ""

    if enable_session:
        session.end_session(session_file, output, total_tool_calls, _MAX_TOOL_ITERATIONS, bool(output))

    om = manage_output(output, run_id)
    return {
        "output": om["output"],
        "truncated": om["truncated"],
        "output_file": om["output_file"],
        "full_length": om["full_length"],
        "tool_calls": total_tool_calls,
        "iterations": _MAX_TOOL_ITERATIONS,
        "run_id": run_id,
        "session_file": session_file,
    }


async def resume_single(
    run_id: str,
    follow_up: str = "",
    default_model: str = "",
) -> dict[str, Any] | None:
    """从会话恢复执行

    Args:
        run_id: 要恢复的会话 ID
        follow_up: 追加的任务说明
        default_model: 默认模型

    Returns:
        同 run_single 的返回值，或 None（会话不存在）
    """
    from lumen.services.llm import chat
    from lumen.config import get_model
    from lumen.tools.parse import parse_tool_call
    from lumen.tool import execute_tool
    from . import session
    from .agent_config import get_agent, AgentConfig

    # 加载历史消息
    resume_data = session.load_messages_for_resume(run_id)
    if not resume_data:
        return None

    agent_name = resume_data["agent"]
    agent = get_agent(agent_name)
    if not agent:
        agent = AgentConfig(name=agent_name)

    model = agent.model or default_model or get_model()
    messages = resume_data["messages"]

    # 如果有 follow_up，追加到消息末尾
    if follow_up:
        messages.append({"role": "user", "content": follow_up})

    # 创建新会话记录
    new_run_id = f"{run_id}_r"
    session_file = session.create_session(new_run_id, agent_name, resume_data["task"], "resume")

    total_tool_calls = 0

    for iteration in range(_MAX_TOOL_ITERATIONS):
        response = await chat(messages=messages, model=model, stream=False)
        if not response or not response.choices:
            break

        content = response.choices[0].message.content or ""
        session.log_message(session_file, "assistant", content[:1000])

        tool_data, error = parse_tool_call(content)

        if not tool_data:
            session.end_session(session_file, content, total_tool_calls, iteration + 1, True)
            om = manage_output(content, new_run_id)
            return {
                "output": om["output"],
                "truncated": om["truncated"],
                "output_file": om["output_file"],
                "full_length": om["full_length"],
                "tool_calls": total_tool_calls,
                "iterations": iteration + 1,
                "run_id": new_run_id,
                "session_file": session_file,
                "resumed_from": run_id,
            }

        tool_name = tool_data.get("tool", "")
        tool_params = tool_data.get("params", {})
        tool_command = tool_data.get("command", "")

        if agent.tools and tool_name not in agent.tools:
            error_msg = f"错误：工具 {tool_name} 不可用。可用：{', '.join(agent.tools)}"
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": error_msg})
            continue

        result = await execute_tool(tool_name, tool_params, command=tool_command)
        total_tool_calls += 1
        session.log_tool_call(session_file, tool_name, tool_params, result)

        result_msg = f"工具 {tool_name} 的结果：\n{json.dumps(result, ensure_ascii=False)}"
        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": result_msg})
        session.log_message(session_file, "tool", result_msg[:1000])

    # 循环结束
    response = await chat(messages=messages, model=model, stream=False)
    if response and response.choices:
        output = response.choices[0].message.content or ""
    else:
        output = ""
    session.end_session(session_file, output, total_tool_calls, _MAX_TOOL_ITERATIONS, bool(output))

    om = manage_output(output, new_run_id)
    return {
        "output": om["output"],
        "truncated": om["truncated"],
        "output_file": om["output_file"],
        "full_length": om["full_length"],
        "tool_calls": total_tool_calls,
        "iterations": _MAX_TOOL_ITERATIONS,
        "run_id": new_run_id,
        "session_file": session_file,
        "resumed_from": run_id,
    }
