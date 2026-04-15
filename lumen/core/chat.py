"""
Lumen - 对话核心模块
所有对话逻辑都在这，不管是终端还是网页都调用这里
"""

import json
import logging

import jsonschema

from lumen.core.session import ChatSession
from lumen.prompt.character import load_character
from lumen.prompt.builder import build_system_prompt
from lumen.services.context import trim_messages, fold_tool_calls, filter_for_ai
from lumen.services import history
from lumen.services import memory
from lumen.tools.base import execute_tool, execute_tools_parallel, get_tool_prompt
from lumen.tools.parse import parse_tool_call
from lumen.config import get_model, MAX_TOOL_ITERATIONS
from lumen.services.llm import chat
from lumen.tools.registry import get_registry
from lumen.prompt.template import render_messages, collect_variables

logger = logging.getLogger(__name__)


def _prepare_messages(messages, character_id: str = "default"):
    """预处理消息：折叠工具调用 → 裁剪上下文 → 过滤已折叠 → 模板变量替换

    所有发给 LLM 的消息都必须经过这个函数

    Args:
        messages: 原始消息列表（不会被修改）
        character_id: 当前角色ID，用于加载对应的记忆
    """
    folded = fold_tool_calls(messages)
    trimmed = trim_messages(folded)
    filtered = filter_for_ai(trimmed)
    variables = collect_variables(character_id)
    return render_messages(filtered, variables)


def validate_tool_call(tool_name: str, tool_params: dict) -> str:
    """验证 AI 的工具调用是否正确

    使用 jsonschema 标准库验证参数，工具定义本身就是 JSON Schema 格式。

    Args:
        tool_name: 工具名称
        tool_params: 参数字典

    Returns:
        None 如果验证通过，错误消息字符串如果验证失败
    """
    registry = get_registry()

    # 1. 检查工具是否存在
    if not registry.exists(tool_name):
        available = registry.list_tools()
        return f"工具 '{tool_name}' 不存在，可用工具: {', '.join(available)}"

    # 2. 用工具的 JSON Schema 定义验证参数
    tool_def = registry.get_tool(tool_name)
    params_schema = tool_def.get("parameters", {})

    try:
        jsonschema.validate(instance=tool_params, schema=params_schema)
    except jsonschema.ValidationError as e:
        return f"参数验证失败: {e.message}"

    return None


def chat_non_stream(user_input: str, session: ChatSession) -> str:
    """非流式：等AI想完了再一次性返回

    Args:
        user_input: 用户输入
        session: ChatSession 实例

    Returns:
        AI 的完整回复
    """
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    trimmed = _prepare_messages(session.messages, session.character_id)
    model = get_model()

    response = chat(trimmed, model, stream=False)

    reply = response.choices[0].message.content
    session.messages.append({"role": "assistant", "content": reply})
    history.save_message(session.session_id, "assistant", reply)
    return reply


def chat_stream(user_input: str, session: ChatSession):
    """流式对话（ReAct 循环：推理 → 行动 → 观察 → ... → 回答）

    核心流程：
    1. AI 思考并决定是否调用工具
    2. 如果调用工具 → 执行 → 把结果喂回给 AI → 回到第1步
    3. 如果不调用工具 → 输出最终回答 → 结束

    退出原因（exit_reason）：
    - "completed": AI 正常完成任务，未调用工具直接回答
    - "completed_after_tools": AI 调用工具后完成任务
    - "max_iterations": 达到最大轮次，强制输出回答

    Args:
        user_input: 用户输入
        session: ChatSession 实例

    Yields:
        AI 的最终回复内容（最后一个 yield 会带 exit_reason 属性）
    """
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    model = get_model()
    exit_reason = "completed"  # 默认：正常完成
    tool_iterations = 0  # 记录实际工具调用轮数

    for iteration in range(MAX_TOOL_ITERATIONS):
        trimmed = _prepare_messages(session.messages, session.character_id)
        response = chat(trimmed, model, stream=True)

        # 收集完整回复（需要完整文本才能解析工具调用）
        reply = ""
        for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                reply += content

        # 解析工具调用
        tool_call = parse_tool_call(reply)

        if not tool_call:
            # 无工具调用 → 这是最终回答
            if tool_iterations > 0:
                exit_reason = "completed_after_tools"
            session.messages.append({"role": "assistant", "content": reply})
            history.save_message(session.session_id, "assistant", reply)
            logger.info(f"[ReAct] 循环结束: {exit_reason}，共 {tool_iterations} 轮工具调用")
            yield reply
            return

        # --- 有工具调用，进入 ReAct 循环 ---
        tool_iterations += 1
        logger.info(f"[ReAct 第{iteration + 1}轮] 检测到工具调用: {tool_call.get('mode')}")

        # 保存 AI 的工具调用原文（LLM 需要看到自己之前的输出才能继续推理）
        session.messages.append({"role": "assistant", "content": reply})

        mode = tool_call.get("mode", "single")

        # ========== 单个工具 ==========
        if mode == "single":
            tool_name = tool_call.get("tool", "")
            tool_params = tool_call.get("params", {})

            validation_error = validate_tool_call(tool_name, tool_params)
            if validation_error:
                # 验证失败 → 反馈错误，继续循环让 AI 重试
                logger.warning(f"工具验证失败: {validation_error}")
                error_feedback = (
                    f"[系统提示] 你的工具调用有误：{validation_error}。"
                    "请重新分析用户需求，选择正确的工具和参数。"
                )
                session.messages.append({"role": "user", "content": error_feedback})
                continue  # 回到循环顶部，让 AI 重新思考

            # 验证通过 → 执行工具
            tool_result = execute_tool(tool_name, tool_params)
            logger.info(
                f"工具调用: {tool_name}({tool_params}) → "
                f"{'✅' if tool_result['success'] else '❌'}"
            )
            if tool_result["success"]:
                logger.debug(f"  数据: {tool_result['data']}")
                logger.debug(f"  耗时: {tool_result.get('execution_time', 'N/A')}ms")
            else:
                logger.warning(
                    f"  错误: {tool_result['error_code']} - {tool_result['error_message']}"
                )

            # 把工具结果追加到对话历史
            session.messages.append({
                "role": "user",
                "content": json.dumps(tool_result, ensure_ascii=False),
                "metadata": {
                    "type": "tool_result",
                    "tool_name": tool_name,
                    "folded": False
                }
            })

        # ========== 多个工具并行 ==========
        elif mode == "parallel":
            calls = tool_call.get("calls", [])

            # 验证所有工具调用
            all_errors = []
            for call in calls:
                error = validate_tool_call(call.get("tool", ""), call.get("params", {}))
                if error:
                    all_errors.append(f"- {call.get('tool')}: {error}")

            if all_errors:
                logger.warning(f"并行工具验证失败:\n" + "\n".join(all_errors))
                error_feedback = (
                    "[系统提示] 你的并行工具调用有误：\n"
                    + "\n".join(all_errors)
                    + "\n请重新分析用户需求，选择正确的工具和参数。"
                )
                session.messages.append({"role": "user", "content": error_feedback})
                continue

            # 验证通过 → 并发执行所有工具
            logger.info(f"并行执行 {len(calls)} 个工具...")
            results = execute_tools_parallel(calls)

            for r in results:
                status = "✅" if r["success"] else "❌"
                logger.info(f"  - {r['tool']}: {status}")

            session.messages.append({
                "role": "user",
                "content": json.dumps(results, ensure_ascii=False),
                "metadata": {
                    "type": "tool_result_parallel",
                    "tool_count": len(results),
                    "folded": False
                }
            })

        # 循环继续 → 下一轮 AI 会看到工具结果，决定是继续调用还是输出最终回答

    # 达到最大迭代次数，强制 AI 输出最终回答
    exit_reason = "max_iterations"
    logger.warning(
        f"[ReAct] 达到最大工具调用次数限制 ({MAX_TOOL_ITERATIONS})，强制输出回答"
    )
    session.messages.append({
        "role": "user",
        "content": (
            "[系统提示] 已达到最大思考轮次限制。"
            "请基于已有的工具执行结果，直接给出最终回答，不要再调用工具。"
        )
    })
    trimmed = _prepare_messages(session.messages, session.character_id)
    response = chat(trimmed, model, stream=False)
    final_reply = response.choices[0].message.content
    session.messages.append({"role": "assistant", "content": final_reply})
    history.save_message(session.session_id, "assistant", final_reply)
    yield final_reply
