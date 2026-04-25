"""
Lumen - 查询引擎
核心决策循环，对标 Claude Code query.ts
"""

import json
import logging
import asyncio
import time
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
from lumen.tool import execute_tool, execute_tools_parallel, format_result_for_ai, set_tool_context
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
    session_id: str = "",
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
        session_id=session_id,
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


async def _resolve_knowledge_placeholders(
    messages: list[Message],
    user_input: str,
    character_config: dict,
) -> tuple[list[Message], bool, set[str]]:
    """解析 system prompt 中的知识库占位符（{{分类名}} / [[分类名]]）

    有占位符 → 在 system prompt 内替换检索结果（VCP 方式，强 RP 权重）
    无占位符 → 返回 has_placeholders=False，由语义路由补上
    两层叠加不互斥：返回已覆盖的 file_id 集合供语义路由去重
    """
    from lumen.prompt.knowledge_resolver import resolve

    knowledge_enabled = character_config.get("knowledge_enabled", True)
    if not knowledge_enabled:
        return messages, False, set()

    # 找第一条 system 消息（system prompt）
    for i, msg in enumerate(messages):
        if msg["role"] == "system":
            resolved_text, has_placeholders, covered_ids = await resolve(
                msg["content"],
                user_input,
                token_budget=character_config.get("knowledge_token_budget", 0) or None,
            )
            if has_placeholders:
                result = list(messages)
                result[i] = {**msg, "content": resolved_text}
                return result, True, covered_ids
            break

    return messages, False, set()


async def _inject_knowledge(
    messages: list[Message],
    user_input: str,
    character_config: dict,
    exclude_file_ids: set[str] = None,
) -> tuple[list[Message], list[dict]]:
    """语义路由：自动搜索知识库，注入未占位符覆盖的分类（与占位符互补）

    当角色配置 knowledge_semantic_routing=True 时生效。
    exclude_file_ids: 占位符已覆盖的 file_id 集合，这些文件的结果会被排除。
    """
    from lumen.services.knowledge import search as knowledge_search
    from lumen.services.context.token_estimator import estimate_text_tokens

    knowledge_enabled = character_config.get("knowledge_enabled", True)
    semantic_routing = character_config.get("knowledge_semantic_routing", True)
    if not knowledge_enabled or not semantic_routing:
        return messages, []

    top_k = character_config.get("knowledge_top_k", 3)
    min_score = character_config.get("knowledge_min_score", 0.3)
    if character_config.get("knowledge_token_budget"):
        token_budget = character_config["knowledge_token_budget"]
    else:
        from lumen.config import KNOWLEDGE_SEMANTIC_BUDGET
        token_budget = KNOWLEDGE_SEMANTIC_BUDGET

    results = await knowledge_search(user_input, top_k=top_k, min_score=min_score)
    if not results:
        return messages, []

    # 去重：排除占位符已覆盖的文件
    if exclude_file_ids:
        results = [r for r in results if r.get("file_id", "") not in exclude_file_ids]
    if not results:
        return messages, []

    # Token 预算控制
    parts = []
    used_tokens = 0
    header_tokens = 60  # 标签头尾开销

    for hit in results:
        filename = hit.get("filename", "未知来源")
        content = hit.get("content", "")
        score = hit.get("score", 0)

        entry = f"[来源: {filename}，相关度: {score:.2f}]\n{content}"
        entry_tokens = estimate_text_tokens(entry)

        if used_tokens + entry_tokens + header_tokens > token_budget:
            break
        parts.append(entry)
        used_tokens += entry_tokens

    if not parts:
        return messages, []

    knowledge_text = (
        "<knowledge_base>\n"
        "以下是从知识库中检索到的参考资料，请据此回答用户问题。"
        "如果参考资料与问题无关，可以忽略。\n\n"
        + "\n\n".join(parts)
        + "\n</knowledge_base>"
    )

    last_user_idx = _find_last_user_index(messages)
    if last_user_idx == -1:
        return messages, []

    result = messages[:last_user_idx] + [
        {"role": "system", "content": knowledge_text}
    ] + messages[last_user_idx:]

    kb_log = [{"source": "knowledge", "hits": len(parts), "tokens": used_tokens}]
    return result, kb_log


async def _inject_thinking_clusters(
    messages: list[Message],
    user_input: str,
    character_config: dict,
) -> tuple[list[Message], list[dict]]:
    """执行思维簇管道，注入检索到的思维模块

    仅在角色配置 thinking_clusters_enabled=True 时激活。
    管道：嵌入用户查询 → 按链配置依次检索各簇 → 向量融合 → token 预算裁剪 → 注入
    """
    if not character_config.get("thinking_clusters_enabled", False):
        return messages, []

    from lumen.services.thinking_clusters import run_chain, get_chain_config, ensure_indexed
    from lumen.services.embedding import get_service

    # 加载链配置
    chain_name = character_config.get("thinking_clusters_chain", "default")
    chain = get_chain_config(chain_name)
    if not chain.steps:
        return messages, []

    # 确保模块已索引
    await ensure_indexed()

    # 编码用户查询（必须用 thinking_clusters 服务的后端，与索引一致）
    backend = await get_service("thinking_clusters")
    if not backend:
        return messages, []
    query_vector = await backend.encode(user_input)
    if not query_vector:
        return messages, []

    # 运行管道
    result = await run_chain(query_vector, chain, character_config)
    if not result["injection_text"]:
        return messages, []

    # 注入到最后一条 user 消息之前（与记忆/知识注入一致）
    last_user_idx = _find_last_user_index(messages)
    if last_user_idx == -1:
        return messages, []

    injection_msg = {"role": "system", "content": result["injection_text"]}
    result_messages = messages[:last_user_idx] + [injection_msg] + messages[last_user_idx:]

    tc_log = [{
        "source": "thinking_clusters",
        "chain": chain_name,
        "modules": len(result["modules"]),
        "tokens": result["total_tokens"],
        "degraded": result["degraded_clusters"],
    }]
    return result_messages, tc_log


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


async def _auto_title(session_id: str):
    """后台 fire-and-forget：用 LLM 从完整对话内容生成简短会话标题"""
    try:
        from lumen.services import history as hist
        messages_raw = await asyncio.to_thread(hist.load_session, session_id)

        conversation_lines = []
        for msg in messages_raw[:10]:
            role_label = "用户" if msg["role"] == "user" else "AI"
            content = msg["content"][:150]
            conversation_lines.append(f"{role_label}: {content}")

        if not conversation_lines:
            return

        conversation_text = "\n".join(conversation_lines)

        from lumen.config import DEFAULT_MODEL
        resp = await chat(
            messages=[
                {"role": "system", "content":
                    "你是一个会话标题生成器。根据以下对话内容，生成一个简短的标题。\n"
                    "要求：\n"
                    "- 一句话概括对话的核心话题（10-20字）\n"
                    "- 要具体，避免模糊的标题如「对话」「讨论」「聊天」\n"
                    "- 如果对话涉及具体事物，标题中应包含关键信息\n"
                    "- 只输出标题文本，不加引号、标点或解释"},
                {"role": "user", "content": conversation_text},
            ],
            model=DEFAULT_MODEL,
            stream=False,
        )
        title = resp.choices[0].message.content.strip()[:20]
        if title:
            await asyncio.to_thread(hist.update_session_title, session_id, title)
            logger.info(f"[自动命名] {session_id} -> {title}")
    except Exception as e:
        logger.debug(f"自动命名失败（不影响聊天）: {e}")


async def chat_non_stream(user_input: str, session: ChatSession, response_style: str = "balanced") -> str:
    """非流式：等AI想完了再一次性返回"""
    session.messages.append({"role": "user", "content": user_input})
    msg_id = await _save_and_vectorize(session.session_id or "default", "user", user_input, session.character_id)
    session.messages[-1]["id"] = msg_id

    # 加载角色配置（模型 + compact）
    character_config = load_character(session.character_id)
    character_config["response_style"] = response_style
    model = get_model(character_config)

    # 自动 compact 检查
    if should_compact(session, character_config):
        await compact_session(session)

    trimmed = _prepare_messages(session.messages, session.character_id)
    trimmed = _inject_authors_note(trimmed, session.session_id)
    trimmed, _ = await _inject_relevant_memories(trimmed, user_input, session.character_id, character_config, session.session_id or "")
    # 知识注入：占位符（system prompt 内替换）+ 语义路由（自动兜底），两层叠加
    trimmed, _, covered_ids = await _resolve_knowledge_placeholders(trimmed, user_input, character_config)
    trimmed, _ = await _inject_knowledge(trimmed, user_input, character_config, exclude_file_ids=covered_ids)
    trimmed, _ = await _inject_thinking_clusters(trimmed, user_input, character_config)

    response = await chat(trimmed, model, stream=False)

    # 记录 token 用量
    usage = extract_usage(response)
    if usage:
        record_usage(session.session_id, usage["input_tokens"], usage["output_tokens"])

    reply = response.choices[0].message.content or ""
    session.messages.append({"role": "assistant", "content": reply})
    msg_id = await _save_and_vectorize(session.session_id or "default", "assistant", reply, session.character_id)
    session.messages[-1]["id"] = msg_id
    # 首次对话完成后生成标题
    if len(session.messages) <= 5:
        asyncio.create_task(_auto_title(session.session_id))
    return reply


async def chat_stream(user_input: str, session: ChatSession, memory_debug: bool = False, response_style: str = "balanced") -> AsyncGenerator[SSEEvent, None]:
    """流式对话（ReAct 循环）

    Args:
        memory_debug: 开启记忆调试模式，yield 分层 token 信息

    Yields:
        SSEEvent — TypedDict 类型的事件（text/done/tool_start/tool_result/status/memory_debug）
    """
    session.messages.append({"role": "user", "content": user_input})
    msg_id = await _save_and_vectorize(session.session_id or "default", "user", user_input, session.character_id)
    session.messages[-1]["id"] = msg_id

    _clear_cancel(session.session_id)

    character_config = load_character(session.character_id)
    character_config["response_style"] = response_style
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
    trace_enabled = memory_debug  # 跟随 /tokens 调试模式

    for iteration in range(MAX_TOOL_ITERATIONS):
        if _is_cancelled(session.session_id):
            _clear_cancel(session.session_id)
            if trace_enabled:
                yield {"type": "react_trace", "iteration": iteration, "action": "cancelled"}
            yield {"type": "done", "exit_reason": "cancelled"}
            return

        trimmed = _prepare_messages(session.messages, session.character_id)
        trimmed = _inject_authors_note(trimmed, session.session_id)
        trimmed = _inject_worldbook(trimmed, session.character_id)
        if iteration == 0:
            trimmed, mem_log = await _inject_relevant_memories(trimmed, user_input, session.character_id, character_config, session.session_id or "")
            # 知识注入：占位符（system prompt 内替换）+ 语义路由（自动兜底），两层叠加
            trimmed, _, covered_ids = await _resolve_knowledge_placeholders(trimmed, user_input, character_config)
            trimmed, kb_log = await _inject_knowledge(trimmed, user_input, character_config, exclude_file_ids=covered_ids)
            trimmed, tc_log = await _inject_thinking_clusters(trimmed, user_input, character_config)
            recall_log = mem_log + kb_log + tc_log

        # /tokens 记忆调试：yield 提示词分层信息
        if memory_debug and iteration == 0:
            from lumen.prompt.builder import build_system_prompt_with_layers
            _, layer_infos = build_system_prompt_with_layers(
                character_config,
                session.dynamic_context if hasattr(session, 'dynamic_context') else None,
            )
            # 补充消息流中的注入层（世界书、记忆、知识库、Author's Note 在 trimmed 中以 system 消息存在）
            for msg in trimmed:
                if msg["role"] == "system":
                    if msg["content"].startswith("<relevant_history>"):
                        layer_infos.append({"name": "跨会话记忆", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
                    elif msg["content"].startswith("<knowledge_base>"):
                        layer_infos.append({"name": "知识库检索", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
                    elif msg["content"].startswith("<thinking_modules>"):
                        layer_infos.append({"name": "思维簇", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
            yield {
                "type": "memory_debug",
                "layers": layer_infos,
                "total_tokens": estimate_messages_tokens(trimmed),
                "context_size": character_config.get("context_size") or 4096,
                "recall_log": recall_log,
            }

        llm_start = time.perf_counter()
        response = await chat(trimmed, model, stream=True)

        full_text = ""
        in_think = False  # <think...</think 标签状态
        think_sent_start = False

        async for chunk in response:
            if not chunk.choices:
                continue
            content = chunk.choices[0].delta.content
            if not content:
                continue

            full_text += content

            # ---- Think 标签 → 事件流 ----
            if in_think:
                if '</think' in content:
                    close_idx = content.find('</think')
                    gt_idx = content.find('>', close_idx)
                    if gt_idx >= 0:
                        think_content = content[:close_idx]
                        if think_content:
                            yield {"type": "think_content", "content": think_content}
                        yield {"type": "think_end"}
                        in_think = False
                        think_sent_start = False
                        remaining = content[gt_idx + 1:]
                        if remaining:
                            yield {"type": "text", "content": remaining}
                    else:
                        yield {"type": "think_content", "content": content}
                else:
                    yield {"type": "think_content", "content": content}
                continue

            # 检查 <think 开标签
            if '<think' in content:
                tag_start = content.find('<think')
                gt_idx = content.find('>', tag_start)
                if gt_idx >= 0:
                    before = content[:tag_start]
                    after = content[gt_idx + 1:]
                    if before:
                        yield {"type": "text", "content": before}
                    yield {"type": "think_start"}
                    think_sent_start = True
                    in_think = True
                    if after:
                        if '</think' in after:
                            close_idx = after.find('</think')
                            close_gt = after.find('>', close_idx)
                            if close_gt >= 0:
                                think_text = after[:close_idx]
                                if think_text:
                                    yield {"type": "think_content", "content": think_text}
                                yield {"type": "think_end"}
                                in_think = False
                                remaining = after[close_gt + 1:]
                                if remaining:
                                    yield {"type": "text", "content": remaining}
                        else:
                            yield {"type": "think_content", "content": after}
                    continue
                else:
                    # 不完整标签，先缓冲
                    continue

            # 直接流式发送，前端 VCP 内联解析处理工具 JSON
            yield {"type": "text", "content": content}

        # 流式结束后检查取消
        thinking_ms = round((time.perf_counter() - llm_start) * 1000)
        if _is_cancelled(session.session_id):
            _clear_cancel(session.session_id)
            if trace_enabled:
                yield {"type": "react_trace", "iteration": iteration, "action": "cancelled", "duration_ms": thinking_ms}
            yield {"type": "done", "exit_reason": "cancelled"}
            return

        # ---- 处理本轮结果 ----
        tool_call, parse_error = parse_tool_call(full_text) if full_text.strip() else (None, "empty response")

        if not tool_call:
            if trace_enabled:
                yield {
                    "type": "react_trace",
                    "iteration": iteration,
                    "action": "response",
                    "duration_ms": thinking_ms,
                    "exit_reason": "completed_after_tools" if tool_iterations > 0 else "completed",
                }
            # 检查是否是格式错误的工具调用（包含工具调用关键词但解析失败）
            _tool_keywords = ('"tool_call"', '"tool":', '"tool" :', "'tool'", '"calls":')
            if any(kw in full_text for kw in _tool_keywords):
                logger.warning(f"[ReAct] suspected tool call with parse error: {full_text[:200]}")
                if trace_enabled:
                    yield {"type": "react_trace", "iteration": iteration, "action": "error", "error": f"tool call parse failed: {parse_error}", "duration_ms": thinking_ms}
                # 工具调用格式错误 — 前端 VCP 内联解析会处理 JSON 碎片
                yield {"type": "status", "status": "tool_error", "message": "工具调用格式错误"}
                preview = full_text[:200] + ("..." if len(full_text) > 200 else "")
                error_feedback = (
                    f"[System] Tool call parsing failed.\n"
                    f"Error: {parse_error}\n"
                    f"Your output: {preview}\n\n"
                    f"Correct format:\n"
                    f'{{"tool": "tool_name", "params": {{"param": "value"}}}}\n\n'
                    f"Rules:\n"
                    f"- Start with {{ and end with }}\n"
                    f"- Use double quotes for strings\n"
                    f"- No trailing commas\n"
                    f"- No explanatory text before or after the JSON"
                )
                session.messages.append({"role": "assistant", "content": full_text})
                history.save_message(session.session_id, "assistant", full_text)
                session.messages.append({"role": "user", "content": error_feedback})
                history.save_message(session.session_id, "user", error_feedback)
                continue

            if tool_iterations > 0:
                exit_reason = "completed_after_tools"
            session.messages.append({"role": "assistant", "content": full_text})
            msg_id = await _save_and_vectorize(session.session_id or "default", "assistant", full_text, session.character_id)
            session.messages[-1]["id"] = msg_id
            # 首次对话完成后生成标题
            if len(session.messages) <= 5:
                asyncio.create_task(_auto_title(session.session_id))
            logger.info(f"[ReAct] 循环结束: {exit_reason}，共 {tool_iterations} 轮工具调用")
            yield {"type": "done", "exit_reason": exit_reason}
            return

        # --- 有工具调用，进入 ReAct 循环 ---
        tool_iterations += 1
        logger.info(f"[ReAct 第{iteration + 1}轮] 检测到工具调用: {tool_call.get('mode')}")

        # 提取 AI 在工具调用前的思考文字（JSON 之前的内容）
        thinking_text = full_text[:full_text.find('{')].strip() if '{' in full_text else ""

        # 追踪：工具调用决策
        if trace_enabled:
            _tool_name = tool_call.get("tool", tool_call.get("calls", [{}])[0].get("tool", ""))
            yield {
                "type": "react_trace",
                "iteration": iteration,
                "action": "tool_call",
                "tool": _tool_name,
                "params": tool_call.get("params"),
                "duration_ms": thinking_ms,
                "thinking": thinking_text[:200] if thinking_text else "",
            }

        session.messages.append({"role": "assistant", "content": full_text})
        msg_id = await _save_and_vectorize(session.session_id or "default", "assistant", full_text, session.character_id)
        session.messages[-1]["id"] = msg_id

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
            set_tool_context(session.session_id or "", session.character_id or "")
            tool_exec_start = time.perf_counter()
            tool_result = execute_tool(tool_name, tool_params)
            tool_exec_ms = round((time.perf_counter() - tool_exec_start) * 1000)
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
            if trace_enabled:
                yield {
                    "type": "react_trace",
                    "iteration": iteration,
                    "action": "tool_result",
                    "tool": tool_name,
                    "success": tool_result["success"],
                    "duration_ms": tool_exec_ms,
                }

            caller_name = character_config.get("name", "")
            session.messages.append({
                "role": "user",
                "content": format_result_for_ai(tool_result, caller=caller_name),
                "metadata": {
                    "type": "tool_result",
                    "tool_name": tool_name,
                    "folded": False,
                },
            })
            history.save_message(
                session.session_id, "user",
                format_result_for_ai(tool_result, caller=caller_name),
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
            set_tool_context(session.session_id or "", session.character_id or "")
            logger.info(f"并行执行 {len(calls)} 个工具...")
            tool_exec_start = time.perf_counter()
            results = execute_tools_parallel(calls)
            tool_exec_ms = round((time.perf_counter() - tool_exec_start) * 1000)

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

            if trace_enabled:
                for r in results:
                    yield {
                        "type": "react_trace",
                        "iteration": iteration,
                        "action": "tool_result",
                        "tool": r["tool"],
                        "success": r["success"],
                        "duration_ms": tool_exec_ms,
                    }

            caller_name = character_config.get("name", "")
            session.messages.append({
                "role": "user",
                "content": "\n".join(format_result_for_ai(r, caller=caller_name) for r in results),
                "metadata": {
                    "type": "tool_result_parallel",
                    "tool_count": len(results),
                    "folded": False,
                },
            })
            history.save_message(
                session.session_id, "user",
                "\n".join(format_result_for_ai(r, caller=caller_name) for r in results),
                {"type": "tool_result_parallel", "tool_count": len(results), "folded": False},
            )

    # 达到最大迭代次数
    exit_reason = "max_iterations"
    logger.warning(
        f"[ReAct] 达到最大工具调用次数限制 ({MAX_TOOL_ITERATIONS})，强制输出回答"
    )
    if trace_enabled:
        yield {"type": "react_trace", "iteration": MAX_TOOL_ITERATIONS, "action": "error", "error": f"达到最大迭代次数 ({MAX_TOOL_ITERATIONS})"}
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
    msg_id = await _save_and_vectorize(session.session_id or "default", "assistant", final_reply, session.character_id)
    session.messages[-1]["id"] = msg_id
    # 首次对话完成后生成标题
    if len(session.messages) <= 5:
        asyncio.create_task(_auto_title(session.session_id))
    yield {"type": "done", "exit_reason": exit_reason}