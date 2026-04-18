"""
Lumen - 对话核心模块
所有对话逻辑都在这，不管是终端还是网页都调用这里
"""

import json
import logging
from typing import AsyncGenerator

import jsonschema

from lumen.core.session import ChatSession
from lumen.prompt.character import load_character
from lumen.prompt.builder import build_system_prompt
from lumen.services.context import trim_messages, fold_tool_calls, filter_for_ai
from lumen.services import history
from lumen.services import memory
from lumen.services.context.compact import should_compact, compact_session
from lumen.services.context.token_estimator import extract_usage, record_usage
from lumen.tools.base import execute_tool, execute_tools_parallel, format_result_for_ai
from lumen.tools.parse import parse_tool_call
from lumen.config import get_model, MAX_TOOL_ITERATIONS
from lumen.services.llm import chat
from lumen.tools.registry import get_registry
from lumen.prompt.template import render_messages, collect_variables
from lumen.prompt.authors_note import get_authors_note_config
from lumen.types.messages import Message, MessageType
from lumen.types.events import SSEEvent

logger = logging.getLogger(__name__)

# 会话级取消标志：{session_id: True}
_cancel_flags: dict[str, bool] = {}


def request_cancel(session_id: str):
    """外部调用来请求取消某个会话的流式生成"""
    _cancel_flags[session_id] = True


def _is_cancelled(session_id: str) -> bool:
    return _cancel_flags.get(session_id, False)


def _clear_cancel(session_id: str):
    _cancel_flags.pop(session_id, None)


def _prepare_messages(messages: list[Message], character_id: str = "default") -> list[Message]:
    """预处理消息：折叠工具调用 → 裁剪上下文 → 过滤已折叠 → 模板变量替换

    所有发给 LLM 的消息都必须经过这个函数
    """
    folded = fold_tool_calls(messages)
    trimmed = trim_messages(folded)
    filtered = filter_for_ai(trimmed)
    variables = collect_variables(character_id)
    return render_messages(filtered, variables)


def _inject_authors_note(messages: list[Message], session_id: str) -> list[Message]:
    """在消息流中注入 Author's Note（临时，不存库）

    找到最后一条 user 消息，在其前/后插入一条 system 消息。
    无配置 / disabled / 空内容 → 原样返回。
    """
    config = get_authors_note_config(session_id)
    if not config or not config.enabled or not config.content.strip():
        return messages

    # 找最后一条 user 消息的位置（从后往前找）
    last_user_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "user":
            last_user_idx = i
            break

    if last_user_idx == -1:
        return messages

    note_msg = {"role": "system", "content": config.content}
    insert_idx = last_user_idx if config.injection_position == "before_user" else last_user_idx + 1

    result = messages[:insert_idx] + [note_msg] + messages[insert_idx:]
    return result


def _inject_worldbook(messages: list[Message], character_id: str) -> list[Message]:
    """在消息流中注入世界书内容（基于关键词匹配）

    扫描聊天历史，匹配关键词后自动注入相关设定。
    返回新的消息列表（不影响原始消息）。
    """
    from lumen.prompt.worldbook_matcher import get_injection_context

    # 获取世界书动态上下文
    worldbook_contexts = get_injection_context(
        messages,
        character_id
    )

    if not worldbook_contexts:
        return messages

    # 找到最后一条 user 消息的位置
    last_user_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "user":
            last_user_idx = i
            break

    if last_user_idx == -1:
        # 没有 user 消息，注入到末尾
        for ctx in worldbook_contexts:
            messages.append({"role": "system", "content": ctx["content"]})
        return messages

    # 按 injection_point 分组注入
    before_sys_msgs = [ctx for ctx in worldbook_contexts if ctx["injection_point"] == "before_sys"]
    after_sys_msgs = [ctx for ctx in worldbook_contexts if ctx["injection_point"] == "after_sys"]
    before_user_msgs = [ctx for ctx in worldbook_contexts if ctx["injection_point"] == "before_user"]
    after_user_msgs = [ctx for ctx in worldbook_contexts if ctx["injection_point"] == "after_user"]

    # 构建新消息列表
    result = []

    # before_sys: 插入到第一条消息之前（系统提示词前）
    if before_sys_msgs:
        for ctx in before_sys_msgs:
            result.append({"role": "system", "content": ctx["content"]})

    # 原有消息
    result.extend(messages)

    # after_sys: 插入到第一条消息之后（系统提示词后）
    if after_sys_msgs:
        # 找第一条消息的插入位置
        insert_idx = 1 if len(messages) > 0 else 0
        for ctx in reversed(after_sys_msgs):  # 倒序插入，保持顺序
            result.insert(insert_idx, {"role": "system", "content": ctx["content"]})

    # before_user: 插入到最后一条 user 消息之前
    if before_user_msgs:
        insert_idx = last_user_idx
        for ctx in before_user_msgs:
            result.insert(insert_idx, {"role": "system", "content": ctx["content"]})
            insert_idx += 1

    # after_user: 插入到最后一条 user 消息之后
    if after_user_msgs:
        insert_idx = last_user_idx + 1
        for ctx in after_user_msgs:
            result.insert(insert_idx, {"role": "system", "content": ctx["content"]})
            insert_idx += 1

    return result


def validate_tool_call(tool_name: str, tool_params: dict) -> str:
    """验证 AI 的工具调用是否正确

    Returns:
        None 如果验证通过，错误消息字符串如果验证失败
    """
    registry = get_registry()

    if not registry.exists(tool_name):
        available = registry.list_tools()
        return f"工具 '{tool_name}' 不存在，可用工具: {', '.join(available)}"

    tool_def = registry.get_tool(tool_name)
    params_schema = tool_def.get("parameters", {})

    try:
        jsonschema.validate(instance=tool_params, schema=params_schema)
    except jsonschema.ValidationError as e:
        return f"参数验证失败: {e.message}"

    return None


async def chat_non_stream(user_input: str, session: ChatSession) -> str:
    """非流式：等AI想完了再一次性返回"""
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    # 加载角色配置（模型 + compact）
    character_config = load_character(session.character_id)
    model = get_model(character_config)

    # 自动 compact 检查
    if should_compact(session, character_config):
        await compact_session(session)

    trimmed = _prepare_messages(session.messages, session.character_id)
    trimmed = _inject_authors_note(trimmed, session.session_id)

    response = await chat(trimmed, model, stream=False)

    # 记录 token 用量
    usage = extract_usage(response)
    if usage:
        record_usage(session.session_id, usage["input_tokens"], usage["output_tokens"])

    reply = response.choices[0].message.content
    session.messages.append({"role": "assistant", "content": reply})
    history.save_message(session.session_id, "assistant", reply)
    return reply


async def chat_stream(user_input: str, session: ChatSession) -> AsyncGenerator[SSEEvent, None]:
    """流式对话（ReAct 循环）

    Yields:
        SSEEvent — TypedDict 类型的事件（text/done/tool_start/tool_result/status）
    """
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    _clear_cancel(session.session_id)

    character_config = load_character(session.character_id)
    model = get_model(character_config)

    # 自动 compact 检查
    if should_compact(session, character_config):
        result = await compact_session(session)
        if result["compacted"]:
            yield {
                "type": "status",
                "status": "compacted",
                "message": f"上下文已压缩: {result['tokens_before']} → {result['tokens_after']} tokens",
            }

    exit_reason = "completed"
    tool_iterations = 0

    for iteration in range(MAX_TOOL_ITERATIONS):
        if _is_cancelled(session.session_id):
            _clear_cancel(session.session_id)
            yield {"type": "done", "exit_reason": "cancelled"}
            return

        trimmed = _prepare_messages(session.messages, session.character_id)
        trimmed = _inject_authors_note(trimmed, session.session_id)
        trimmed = _inject_worldbook(trimmed, session.character_id)  # 世界书注入
        response = await chat(trimmed, model, stream=True)

        buffer = ""
        is_tool_call = None
        full_text = ""

        async for chunk in response:
            content = chunk.choices[0].delta.content
            if not content:
                continue

            buffer += content
            full_text += content

            if is_tool_call is None:
                stripped = buffer.strip()
                if stripped:
                    if stripped[0] == '{':
                        is_tool_call = True
                    else:
                        is_tool_call = False
                        yield {"type": "text", "content": buffer}
                        buffer = ""
            elif not is_tool_call:
                yield {"type": "text", "content": content}

        # 流式结束后检查取消
        if _is_cancelled(session.session_id):
            _clear_cancel(session.session_id)
            yield {"type": "done", "exit_reason": "cancelled"}
            return

        # ---- 处理本轮结果 ----
        # 无论回复开头是不是 {，都尝试从完整文本中解析工具调用
        # 原因：有些模型会在 JSON 前加解释文字（如"让我读取文件..."）
        tool_call = parse_tool_call(full_text) if full_text.strip() else None

        if not tool_call:
            # 检查是否是格式错误的工具调用（包含 tool_call 关键词但解析失败）
            if '"tool_call"' in full_text or '"tool":' in full_text:
                logger.warning(f"[ReAct] 检测到疑似工具调用但格式错误: {full_text[:200]}")
                yield {"type": "text_clear"}
                yield {"type": "status", "status": "tool_error", "message": "工具调用格式错误"}
                error_feedback = (
                    "[系统提示] 你的工具调用 JSON 格式有误，无法解析。"
                    "请确保输出完整的 JSON 格式，以 { 开头。"
                    "正确格式：{\"type\": \"tool_call\", \"tool\": \"工具名\", \"params\": {...}}"
                )
                session.messages.append({"role": "assistant", "content": full_text})
                session.messages.append({"role": "user", "content": error_feedback})
                continue

            if tool_iterations > 0:
                exit_reason = "completed_after_tools"
            session.messages.append({"role": "assistant", "content": full_text})
            history.save_message(session.session_id, "assistant", full_text)
            logger.info(f"[ReAct] 循环结束: {exit_reason}，共 {tool_iterations} 轮工具调用")
            yield {"type": "done", "exit_reason": exit_reason}
            return

        # 工具调用解析成功，如果文本已被流式发送，清除前端显示
        if not is_tool_call:
            yield {"type": "text_clear"}

        # --- 有工具调用，进入 ReAct 循环 ---
        tool_iterations += 1
        logger.info(f"[ReAct 第{iteration + 1}轮] 检测到工具调用: {tool_call.get('mode')}")

        session.messages.append({"role": "assistant", "content": full_text})

        mode = tool_call.get("mode", "single")

        # ========== 单个工具 ==========
        if mode == "single":
            tool_name = tool_call.get("tool", "")
            tool_params = tool_call.get("params", {})

            validation_error = validate_tool_call(tool_name, tool_params)
            if validation_error:
                logger.warning(f"工具验证失败: {validation_error}")
                yield {"type": "status", "status": "tool_error", "message": validation_error}
                error_feedback = (
                    f"[系统提示] 你的工具调用有误：{validation_error}。"
                    "请重新分析用户需求，选择正确的工具和参数。"
                )
                session.messages.append({"role": "user", "content": error_feedback})
                continue

            yield {"type": "tool_start", "tool": tool_name, "params": tool_params}
            tool_result = execute_tool(tool_name, tool_params)
            logger.info(
                f"工具调用: {tool_name}({tool_params}) → "
                f"{'✅' if tool_result['success'] else '❌'}"
            )
            yield {
                "type": "tool_result",
                "tool": tool_name,
                "success": tool_result["success"],
                "data": tool_result.get("data"),
                "error": tool_result.get("error_message"),
            }

            session.messages.append({
                "role": "user",
                "content": format_result_for_ai(tool_result),
                "metadata": {
                    "type": "tool_result",
                    "tool_name": tool_name,
                    "folded": False,
                },
            })

        # ========== 多个工具并行 ==========
        elif mode == "parallel":
            calls = tool_call.get("calls", [])

            all_errors = []
            for call in calls:
                error = validate_tool_call(call.get("tool", ""), call.get("params", {}))
                if error:
                    all_errors.append(f"- {call.get('tool')}: {error}")

            if all_errors:
                logger.warning(f"并行工具验证失败:\n" + "\n".join(all_errors))
                yield {"type": "status", "status": "tool_error", "message": "并行工具验证失败"}
                error_feedback = (
                    "[系统提示] 你的并行工具调用有误：\n"
                    + "\n".join(all_errors)
                    + "\n请重新分析用户需求，选择正确的工具和参数。"
                )
                session.messages.append({"role": "user", "content": error_feedback})
                continue

            tool_names = [c.get("tool") for c in calls]
            yield {"type": "tool_start", "tool": tool_names, "mode": "parallel"}
            logger.info(f"并行执行 {len(calls)} 个工具...")
            results = execute_tools_parallel(calls)

            for r in results:
                status = "✅" if r["success"] else "❌"
                logger.info(f"  - {r['tool']}: {status}")
                yield {
                    "type": "tool_result",
                    "tool": r["tool"],
                    "success": r["success"],
                    "data": r.get("data"),
                    "error": r.get("error_message"),
                }

            session.messages.append({
                "role": "user",
                "content": "\n".join(format_result_for_ai(r) for r in results),
                "metadata": {
                    "type": "tool_result_parallel",
                    "tool_count": len(results),
                    "folded": False,
                },
            })

    # 达到最大迭代次数
    exit_reason = "max_iterations"
    logger.warning(
        f"[ReAct] 达到最大工具调用次数限制 ({MAX_TOOL_ITERATIONS})，强制输出回答"
    )
    yield {"type": "status", "status": "max_iterations"}

    session.messages.append({
        "role": "user",
        "content": (
            "[系统提示] 已达到最大思考轮次限制。"
            "请基于已有的工具执行结果，直接给出最终回答，不要再调用工具。"
        ),
    })
    trimmed = _prepare_messages(session.messages, session.character_id)
    trimmed = _inject_authors_note(trimmed, session.session_id)
    response = await chat(trimmed, model, stream=True)

    final_reply = ""
    async for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            final_reply += content
            yield {"type": "text", "content": content}

    session.messages.append({"role": "assistant", "content": final_reply})
    history.save_message(session.session_id, "assistant", final_reply)
    yield {"type": "done", "exit_reason": exit_reason}
