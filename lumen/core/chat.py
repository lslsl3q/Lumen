"""
Lumen - 对话核心模块
所有对话逻辑都在这，不管是终端还是网页都调用这里
"""

import json
import logging
import asyncio
from typing import Any, AsyncGenerator

import jsonschema

from lumen.core.session import ChatSession
from lumen.prompt.character import load_character
from lumen.prompt.builder import build_system_prompt
from lumen.services.context import trim_messages, fold_tool_calls, filter_for_ai
from lumen.services.context.token_estimator import estimate_text_tokens, estimate_messages_tokens
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


async def _save_and_vectorize(session_id: str, role: str, content: str,
                              character_id: str, metadata: dict[str, Any] | None = None) -> int:
    """保存消息并异步计算向量（仅 user/assistant 真实对话内容）"""
    msg_id = history.save_message(session_id, role, content, metadata)
    if role in ("user", "assistant") and content and len(content) >= 5:
        from lumen.services.memory import vectorize_message
        asyncio.create_task(vectorize_message(msg_id, content, role, session_id, character_id))
    return msg_id

# 会话级取消标志：{session_id: timestamp}
# 值存时间戳，用于清理超时的废弃 key
_cancel_flags: dict[str, float] = {}
_CANCEL_TTL = 300  # 5 分钟超时，超过则视为废弃


def request_cancel(session_id: str):
    """外部调用来请求取消某个会话的流式生成"""
    import time
    _cancel_flags[session_id] = time.time()


def _is_cancelled(session_id: str) -> bool:
    return session_id in _cancel_flags


def _clear_cancel(session_id: str):
    _cancel_flags.pop(session_id, None)
    # 顺便清理超时的废弃 key（防御性）
    if len(_cancel_flags) > 20:
        import time
        now = time.time()
        expired = [k for k, t in _cancel_flags.items() if now - t > _CANCEL_TTL]
        for k in expired:
            _cancel_flags.pop(k, None)


def _find_last_user_index(messages: list[Message]) -> int:
    """从后往前找最后一条 user 消息的索引，没找到返回 -1"""
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "user":
            return i
    return -1


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

    last_user_idx = _find_last_user_index(messages)
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

    worldbook_contexts = get_injection_context(messages, character_id)
    if not worldbook_contexts:
        return messages

    last_user_idx = _find_last_user_index(messages)
    if last_user_idx == -1:
        result = list(messages)
        for ctx in worldbook_contexts:
            result.append({"role": "system", "content": ctx["content"]})
        return result

    # 按注入点分组
    before_sys = [c for c in worldbook_contexts if c["injection_point"] == "before_sys"]
    after_sys = [c for c in worldbook_contexts if c["injection_point"] == "after_sys"]
    before_user = [c for c in worldbook_contexts if c["injection_point"] == "before_user"]
    after_user = [c for c in worldbook_contexts if c["injection_point"] == "after_user"]

    # 顺序构建，避免索引偏移 bug
    result = []
    # before_sys: 第一条消息之前
    for ctx in before_sys:
        result.append({"role": "system", "content": ctx["content"]})
    # 第一条消息（system prompt）
    if messages:
        result.append(messages[0])
    # after_sys: 系统提示词之后
    for ctx in after_sys:
        result.append({"role": "system", "content": ctx["content"]})
    # 中间消息（从第 2 条到 last_user_idx 之前）
    for msg in messages[1:last_user_idx]:
        result.append(msg)
    # before_user: 最后一条 user 消息之前
    for ctx in before_user:
        result.append({"role": "system", "content": ctx["content"]})
    # 最后一条 user 消息
    result.append(messages[last_user_idx])
    # after_user: 最后一条 user 消息之后
    for ctx in after_user:
        result.append({"role": "system", "content": ctx["content"]})
    # 剩余消息
    for msg in messages[last_user_idx + 1:]:
        result.append(msg)

    return result


async def _inject_relevant_memories(
    messages: list[Message],
    user_input: str,
    character_id: str,
    character_config: dict,
) -> tuple[list[Message], list[dict]]:
    """基于用户输入搜索历史消息，注入相关记忆（语义优先，关键词回退）

    只在第一轮迭代调用，返回 (注入后的消息列表, 召回记录)
    """
    from lumen.services.memory import get_relevant_memories

    memory_enabled = character_config.get("memory_enabled", True)
    if not memory_enabled:
        return messages, []

    token_budget = character_config.get("memory_token_budget", 300)
    auto_summarize = character_config.get("memory_auto_summarize", False)

    memory_text, recall_log = await get_relevant_memories(
        user_input, character_id,
        token_budget=token_budget,
        auto_summarize=auto_summarize,
    )

    if not memory_text:
        return messages, recall_log

    last_user_idx = _find_last_user_index(messages)
    if last_user_idx == -1:
        return messages, recall_log

    result = messages[:last_user_idx] + [
        {"role": "system", "content": memory_text}
    ] + messages[last_user_idx:]
    return result, recall_log


def validate_tool_call(tool_name: str, tool_params: dict) -> str | None:
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
    await _save_and_vectorize(session.session_id or "default", "user", user_input, session.character_id)

    # 加载角色配置（模型 + compact）
    character_config = load_character(session.character_id)
    model = get_model(character_config)

    # 自动 compact 检查
    if should_compact(session, character_config):
        await compact_session(session)

    trimmed = _prepare_messages(session.messages, session.character_id)
    trimmed = _inject_authors_note(trimmed, session.session_id)
    trimmed, _ = await _inject_relevant_memories(trimmed, user_input, session.character_id, character_config)

    response = await chat(trimmed, model, stream=False)

    # 记录 token 用量
    usage = extract_usage(response)
    if usage:
        record_usage(session.session_id, usage["input_tokens"], usage["output_tokens"])

    reply = response.choices[0].message.content or ""
    session.messages.append({"role": "assistant", "content": reply})
    await _save_and_vectorize(session.session_id or "default", "assistant", reply, session.character_id)
    return reply


async def chat_stream(user_input: str, session: ChatSession, memory_debug: bool = False) -> AsyncGenerator[SSEEvent, None]:
    """流式对话（ReAct 循环）

    Args:
        memory_debug: 开启记忆调试模式，yield 分层 token 信息

    Yields:
        SSEEvent — TypedDict 类型的事件（text/done/tool_start/tool_result/status/memory_debug）
    """
    session.messages.append({"role": "user", "content": user_input})
    await _save_and_vectorize(session.session_id or "default", "user", user_input, session.character_id)

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
    recall_log = []

    for iteration in range(MAX_TOOL_ITERATIONS):
        if _is_cancelled(session.session_id):
            _clear_cancel(session.session_id)
            yield {"type": "done", "exit_reason": "cancelled"}
            return

        trimmed = _prepare_messages(session.messages, session.character_id)
        trimmed = _inject_authors_note(trimmed, session.session_id)
        trimmed = _inject_worldbook(trimmed, session.character_id)
        if iteration == 0:
            trimmed, recall_log = await _inject_relevant_memories(trimmed, user_input, session.character_id, character_config)

        # /tokens 记忆调试：yield 提示词分层信息
        if memory_debug and iteration == 0:
            from lumen.prompt.builder import build_system_prompt_with_layers
            _, layer_infos = build_system_prompt_with_layers(
                character_config,
                session.dynamic_context if hasattr(session, 'dynamic_context') else None,
            )
            # 补充消息流中的注入层（世界书、记忆、Author's Note 在 trimmed 中以 system 消息存在）
            for msg in trimmed:
                if msg["role"] == "system" and msg["content"].startswith("<relevant_history>"):
                    layer_infos.append({"name": "跨会话记忆", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
            yield {
                "type": "memory_debug",
                "layers": layer_infos,
                "total_tokens": estimate_messages_tokens(trimmed),
                "context_size": character_config.get("context_size") or 4096,
                "recall_log": recall_log,
            }

        response = await chat(trimmed, model, stream=True)

        buffer = ""
        is_tool_call = None
        full_text = ""

        async for chunk in response:
            if not chunk.choices:
                continue
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
                history.save_message(session.session_id, "assistant", full_text)
                session.messages.append({"role": "user", "content": error_feedback})
                history.save_message(session.session_id, "user", error_feedback)
                continue

            if tool_iterations > 0:
                exit_reason = "completed_after_tools"
            session.messages.append({"role": "assistant", "content": full_text})
            await _save_and_vectorize(session.session_id or "default", "assistant", full_text, session.character_id)
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
        await _save_and_vectorize(session.session_id or "default", "assistant", full_text, session.character_id)

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
                history.save_message(session.session_id, "user", error_feedback)
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
            history.save_message(
                session.session_id, "user",
                format_result_for_ai(tool_result),
                {"type": "tool_result", "tool_name": tool_name, "folded": False},
            )

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
                history.save_message(session.session_id, "user", error_feedback)
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
            history.save_message(
                session.session_id, "user",
                "\n".join(format_result_for_ai(r) for r in results),
                {"type": "tool_result_parallel", "tool_count": len(results), "folded": False},
            )

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
        if not chunk.choices:
            continue
        content = chunk.choices[0].delta.content
        if content:
            final_reply += content
            yield {"type": "text", "content": content}

    session.messages.append({"role": "assistant", "content": final_reply})
    await _save_and_vectorize(session.session_id or "default", "assistant", final_reply, session.character_id)
    yield {"type": "done", "exit_reason": exit_reason}