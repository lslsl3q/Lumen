"""
T24 ReActActingComponent — ReAct 决策循环

从 query.py::chat_stream() 提取核心 ReAct 循环。
接收 ContextComponent 拼装的 system prompt + 短期对话历史，
执行 LLM → 解析工具调用 → 执行工具 → 再 LLM 的循环。

自包含设计：不依赖 query.py 的注入函数，所有逻辑内置。
"""

import asyncio
import logging
import re
import time
from typing import AsyncGenerator

import jsonschema

from lumen.components.base import ActingComponent
from lumen.config import get_model, MAX_TOOL_ITERATIONS
from lumen.services.llm import chat, build_thinking_params, log_stream_cache_stats
from lumen.services.context.token_estimator import (
    estimate_text_tokens,
    estimate_messages_tokens,
    record_usage,
)
from lumen.tool import execute_tool, execute_tools_parallel, format_result_for_ai, set_tool_context
from lumen.tools.parse import parse_tool_call
from lumen.tools.registry import get_registry


def _make_room_move_callback():
    """创建 room move 回调（延迟导入 core.message_bus，避免模块级依赖）"""
    def on_room_move(agent_id, old_room, new_room):
        try:
            from lumen.core.message_bus import get_message_bus
            bus = get_message_bus()
            if bus and bus.is_registered(agent_id):
                if old_room:
                    bus.leave_room(old_room, agent_id)
                bus.join_room(new_room, agent_id)
        except Exception:
            pass
    return on_room_move

logger = logging.getLogger(__name__)

# ── 取消管理（会话级） ──

_cancel_flags: dict[str, float] = {}
_CANCEL_TTL = 300


def request_cancel(session_id: str):
    """请求取消某个会话的流式生成"""
    _cancel_flags[session_id] = time.time()


def _is_cancelled(session_id: str) -> bool:
    return session_id in _cancel_flags


def _clear_cancel(session_id: str):
    _cancel_flags.pop(session_id, None)
    if len(_cancel_flags) > 20:
        now = time.time()
        expired = [k for k, t in _cancel_flags.items() if now - t > _CANCEL_TTL]
        for k in expired:
            _cancel_flags.pop(k, None)


# ── 思考标签剥离 ──

def _strip_think_tags(text: str) -> str:
    """移除 content 文本中的 <think...> / <thinking...> 标签及其内容

    支持带属性（空格）、未闭合标签（模型流中断），防止思考内容泄露到正文历史。
    剥离后为空且原本有标签时返回占位符，避免 LiteLLM 空消息报错。
    """
    if not text:
        return ""
    # 匹配完整块: <think...>...</think...> 和 <thinking...>...</thinking...>
    clean = re.sub(r'<think(?:ing)?[^>]*>.*?(?:</think(?:ing)?\s*/?\s*>|$)', '', text, flags=re.DOTALL)
    # 清除孤立的闭合标签（跨 chunk 拆分导致开标签在上一 chunk 被 strip）
    clean = re.sub(r'</think(?:ing)?\s*/?\s*>', '', clean)
    clean = clean.strip()
    if not clean and '<think' in text:
        return "..."
    return clean


def _extract_think_content(text: str) -> str:
    """从 content 文本中提取 <think...> 标签内的思维内容（不含标签本身）

    用于在剥离前保存思维内容到 metadata，确保历史加载时能重建思维气泡。
    """
    if not text or '<think' not in text:
        return ""
    parts = re.findall(r'<think(?:ing)?[^>]*>(.*?)(?:</think(?:ing)?\s*/?\s*>|$)', text, re.DOTALL)
    return "".join(parts).strip()




# ── 消息预处理 ──

def _prepare_messages(messages: list, character_id: str) -> list:
    """预处理消息：构建 LLM 上下文"""
    from lumen.services.context import build_llm_context
    return build_llm_context(messages)


def _find_last_user_index(messages: list) -> int:
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "user":
            return i
    return -1


def _inject_authors_note(messages: list, session_id: str) -> list:
    """注入 Author's Note（临时，不存库）"""
    from lumen.prompt.authors_note import get_authors_note_config
    config = get_authors_note_config(session_id)
    if not config or not config.enabled or not config.content.strip():
        return messages

    last_user_idx = _find_last_user_index(messages)
    if last_user_idx == -1:
        return messages

    note_msg = {"role": "system", "content": config.content}
    insert_idx = last_user_idx if config.injection_position == "before_user" else last_user_idx + 1
    return messages[:insert_idx] + [note_msg] + messages[insert_idx:]


async def _save_and_vectorize(session_id: str, role: str, content: str,
                              character_id: str, metadata: dict = None) -> int:
    """保存消息并异步向量化"""
    from lumen.services.storage import history
    meta = dict(metadata or {})
    meta.setdefault("type", "normal")
    if meta.get("internal"):
        meta.setdefault("hidden", True)
    msg_id = history.save_message(session_id, role, content, meta)
    if role in ("user", "assistant") and meta.get("type") == "normal" and content and len(content) >= 5:
        from lumen.services.memory import vectorize_message
        asyncio.create_task(vectorize_message(msg_id, content, role, session_id, character_id, metadata=meta))
    return msg_id


async def _auto_title(session_id: str) -> str | None:
    """用 LLM 生成会话标题，返回标题字符串或 None"""
    try:
        from lumen.services.storage import history as hist
        from lumen.config import DEFAULT_MODEL
        from lumen.services.llm import chat as llm_chat

        messages_raw = await asyncio.to_thread(hist.load_session, session_id)
        conversation_lines = []
        for msg in messages_raw[:10]:
            if msg["role"] not in ("user", "assistant"):
                continue
            role_label = "用户" if msg["role"] == "user" else "AI"
            content = msg["content"][:150]
            conversation_lines.append(f"{role_label}: {content}")

        if not conversation_lines:
            return None

        conversation_text = "\n".join(conversation_lines)
        resp = await llm_chat(
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
            return title
    except Exception as e:
        logger.debug(f"自动命名失败（不影响聊天）: {e}")
    return None


def _validate_tool_call(tool_name: str, tool_params: dict, command: str = "") -> str | None:
    """验证工具调用参数"""
    registry = get_registry()
    if not registry.exists(tool_name):
        available = registry.list_tools()
        return f"工具 '{tool_name}' 不存在，可用工具: {', '.join(available)}"

    tool_def = registry.get_tool(tool_name)
    commands = tool_def.get("commands", {})
    if commands:
        if not command:
            return f"工具 '{tool_name}' 需要 command 参数，可用命令: {', '.join(commands.keys())}"
        if command not in commands:
            return f"工具 '{tool_name}' 没有命令 '{command}'，可用命令: {', '.join(commands.keys())}"
        params_schema = commands[command].get("parameters", {})
    else:
        params_schema = tool_def.get("parameters", {})

    try:
        jsonschema.validate(instance=tool_params, schema=params_schema)
    except jsonschema.ValidationError as e:
        return f"参数验证失败: {e.message}"
    return None


# ── ReActActingComponent ──

class ReActActingComponent(ActingComponent):
    """ReAct 决策组件：LLM → 工具 → 结果 → 再 LLM 循环"""

    def __init__(self, session, character_config: dict, user_input: str,
                 memory_debug: bool = False, save_user_message: bool = True):
        self.session = session
        self.config = character_config
        self.user_input = user_input
        self.memory_debug = memory_debug
        self.save_user_message = save_user_message
        self.model = get_model(character_config)
        self.thinking_cfg = character_config.get("thinking") if character_config else None

    def _get_user_content(self) -> str:
        """构建用户消息：将模板 User 区内容（如章节上下文）拼在用户输入前面"""
        user_section = ""
        if hasattr(self, '_agent') and self._agent and hasattr(self._agent, '_act_context'):
            user_section = self._agent._act_context.get("_writing_user_section", "")
        if user_section:
            return f"{user_section}\n\n{self.user_input}"
        return self.user_input

    async def decide(
        self,
        static_prompt: str,
        dynamic_prompt: str,
        short_term_history: list[dict],
    ) -> AsyncGenerator[dict, None]:
        """ReAct 决策循环

        static_prompt: STATIC zone 组件的拼接输出（角色卡、工具说明），缓存命中
        dynamic_prompt: DYNAMIC zone 组件的拼接输出（记忆召回、知识库检索），每轮重建
        short_term_history 暂不使用（直接用 session.messages）。
        """
        # ── 1. 知识库占位符解析（仅对动态区）──
        if dynamic_prompt:
            resolved, has_ph, covered_ids = await self._resolve_placeholders(dynamic_prompt)
            if has_ph:
                dynamic_prompt = resolved

        # 思考链：注入硬性指令 + 构建 API 参数
        thinking_extra_body, thinking_effort = build_thinking_params(
            self.model, self.thinking_cfg)

        # ── 2. 保存用户消息 ──
        user_content = self._get_user_content()
        if self.save_user_message:
            self.session.messages.append({"role": "user", "content": user_content})
            msg_id = await _save_and_vectorize(
                self.session.session_id or "default", "user",
                user_content, self.session.character_id,
            )
            self.session.messages[-1]["id"] = msg_id
            yield {"type": "msg_saved", "role": "user", "db_id": msg_id}
        else:
            if not any(
                msg.get("role") == "user" and msg.get("content") == user_content
                for msg in reversed(self.session.messages)
            ):
                self.session.messages.append({"role": "user", "content": user_content})

        _clear_cancel(self.session.session_id)

        # ── 3. Compact 检查 ──
        from lumen.services.context.compact import should_compact, compact_session
        if should_compact(self.session, self.config):
            result = await compact_session(self.session)
            if result["compacted"]:
                yield {
                    "type": "status",
                    "status": "compacted",
                    "message": f"上下文已压缩: {result['tokens_before']} → {result['tokens_after']} tokens",
                }

        exit_reason = "completed"
        tool_iterations = 0
        trace_enabled = self.memory_debug

        # ── 4. ReAct 循环 ──
        for iteration in range(MAX_TOOL_ITERATIONS):
            if _is_cancelled(self.session.session_id):
                _clear_cancel(self.session.session_id)
                if trace_enabled:
                    yield {"type": "react_trace", "iteration": iteration, "action": "cancelled"}
                yield {"type": "done", "exit_reason": "cancelled"}
                return

            # 构建消息：预处理 session.messages → 静态/动态分离
            trimmed = _prepare_messages(self.session.messages, self.session.character_id)

            # 静态区：替换第一条 system 消息（缓存前缀）
            for i, msg in enumerate(trimmed):
                if msg["role"] == "system":
                    trimmed[i] = {**msg, "content": static_prompt}
                    break

            # 动态区：在最后一条 user 消息前插入（不破坏缓存前缀）
            if dynamic_prompt:
                last_user_idx = _find_last_user_index(trimmed)
                if last_user_idx != -1:
                    dynamic_msg = {"role": "system", "content": dynamic_prompt}
                    trimmed = trimmed[:last_user_idx] + [dynamic_msg] + trimmed[last_user_idx:]

            trimmed = _inject_authors_note(trimmed, self.session.session_id)

            # 记忆调试：每次迭代都发射，反映上下文变化（工具调用后可能改变 token 分布）
            if self.memory_debug:
                layer_infos = self._build_layer_infos()
                for msg in trimmed:
                    if msg["role"] == "system":
                        if msg["content"].startswith("<relevant_history>"):
                            layer_infos.append({"name": "跨会话记忆", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
                        elif msg["content"].startswith("<knowledge_base>"):
                            layer_infos.append({"name": "知识库检索", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
                        elif msg["content"].startswith("<thinking_modules>"):
                            layer_infos.append({"name": "思维簇", "content": msg["content"], "tokens": estimate_text_tokens(msg["content"])})
                # 从 MemoryComponent 读取召回日志
                recall_log = []
                if hasattr(self, '_agent') and self._agent:
                    for comp in self._agent.components:
                        if comp.name == "memory" and hasattr(comp, 'last_recall_log'):
                            recall_log = comp.last_recall_log or []
                            break
                yield {
                    "type": "memory_debug",
                    "layers": layer_infos,
                    "total_tokens": estimate_messages_tokens(trimmed),
                    "context_size": self.config.get("context_size") or 4096,
                    "recall_log": recall_log,
                }

            # ── 调用 LLM（流式）──
            llm_start = time.perf_counter()
            response = await chat(trimmed, self.model, stream=True,
                                  extra_body=thinking_extra_body or None,
                                  reasoning_effort=thinking_effort)

            full_text = ""
            current_reasoning_buffer = ""  # reasoning_content 来源的思考内容
            in_think = False              # 仅用于 reasoning_content
            last_chunk = None             # 流式最后一个 chunk（含 usage）

            async for chunk in response:
                last_chunk = chunk
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta

                # ── reasoning_content（DeepSeek R1/V4、GLM 等模型的原生思考过程）──
                reasoning = getattr(delta, 'reasoning_content', None)
                if not reasoning:
                    reasoning = getattr(delta, 'reasoning', None)
                if reasoning:
                    current_reasoning_buffer += reasoning
                    if not in_think:
                        yield {"type": "think_start"}
                        in_think = True
                    yield {"type": "think_content", "content": reasoning}

                content = delta.content
                if not content:
                    continue

                # reasoning_content 的 think 块 → 真实 content 到达时关闭
                if in_think:
                    yield {"type": "think_end"}
                    in_think = False

                # content 直通（含 <think...> 标签），前端内联渲染
                full_text += content
                yield {"type": "text", "content": content}

            # ── 流结束：关闭未结束的 reasoning think 块 ──
            if in_think:
                yield {"type": "think_end"}

            log_stream_cache_stats(last_chunk)

            # 记录 token 用量
            if last_chunk and hasattr(last_chunk, 'usage') and last_chunk.usage:
                u = last_chunk.usage
                record_usage(
                    self.session.session_id,
                    input_tokens=getattr(u, 'prompt_tokens', 0) or 0,
                    output_tokens=getattr(u, 'completion_tokens', 0) or 0,
                )

            thinking_ms = round((time.perf_counter() - llm_start) * 1000)
            if _is_cancelled(self.session.session_id):
                _clear_cancel(self.session.session_id)
                if trace_enabled:
                    yield {"type": "react_trace", "iteration": iteration, "action": "cancelled", "duration_ms": thinking_ms}
                yield {"type": "done", "exit_reason": "cancelled"}
                return

            # ── 处理本轮结果 ──
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

                # 格式错误的工具调用
                _tool_keywords = ('"tool_call"', '"tool":', '"tool" :', "'tool'", '"calls":')
                if any(kw in full_text for kw in _tool_keywords):
                    logger.warning(f"[ReAct] suspected tool call with parse error: {full_text[:200]}")
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
                    clean_content = _strip_think_tags(full_text)
                    think_meta = current_reasoning_buffer or _extract_think_content(full_text)
                    msg = {"role": "assistant", "content": clean_content}
                    if think_meta:
                        msg["reasoning_content"] = think_meta
                    self.session.messages.append(msg)
                    from lumen.services.storage import history
                    history.save_message(self.session.session_id, "assistant", clean_content, {"reasoning_content": think_meta} if think_meta else None)
                    self.session.messages.append({"role": "user", "content": error_feedback, "metadata": {"type": "system_feedback"}})
                    history.save_message(self.session.session_id, "user", error_feedback, {"type": "system_feedback"})
                    continue

                # 最终回答
                if tool_iterations > 0:
                    exit_reason = "completed_after_tools"
                clean_content = _strip_think_tags(full_text)
                think_meta = current_reasoning_buffer or _extract_think_content(full_text)
                msg = {"role": "assistant", "content": clean_content}
                if think_meta:
                    msg["reasoning_content"] = think_meta
                self.session.messages.append(msg)
                meta = {"reasoning_content": think_meta} if think_meta else None
                msg_id = await _save_and_vectorize(
                    self.session.session_id or "default", "assistant",
                    clean_content, self.session.character_id, metadata=meta,
                )
                self.session.messages[-1]["id"] = msg_id
                title = None
                if len(self.session.messages) <= 5:
                    title = await _auto_title(self.session.session_id)
                logger.info(f"[ReAct] 循环结束: {exit_reason}，共 {tool_iterations} 轮工具调用")
                done_event: dict = {"type": "done", "exit_reason": exit_reason, "assistant_db_id": msg_id}
                if title:
                    done_event["title"] = title
                yield done_event
                return

            # ── 工具调用 ──
            tool_iterations += 1
            logger.info(f"[ReAct 第{iteration + 1}轮] 检测到工具调用: {tool_call.get('mode')}")

            thinking_text = full_text[:full_text.find('{')].strip() if '{' in full_text else ""

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

            clean_content = _strip_think_tags(full_text)
            # 提取思维内容：优先 reasoning_buffer，fallback 到 content 中的 <think/> 标签
            think_meta = current_reasoning_buffer or _extract_think_content(full_text)
            msg = {"role": "assistant", "content": clean_content}
            if think_meta:
                msg["reasoning_content"] = think_meta
            self.session.messages.append(msg)
            meta = {"reasoning_content": think_meta} if think_meta else None
            msg_id = await _save_and_vectorize(
                self.session.session_id or "default", "assistant",
                clean_content, self.session.character_id, metadata=meta,
            )
            self.session.messages[-1]["id"] = msg_id
            yield {"type": "msg_saved", "role": "assistant", "db_id": msg_id}

            if thinking_text:
                yield {"type": "text_set", "content": thinking_text}
            else:
                yield {"type": "text_clear"}

            mode = tool_call.get("mode", "single")

            if mode == "single":
                async for event in self._execute_single_tool(tool_call, iteration, trace_enabled):
                    yield event
            elif mode == "parallel":
                async for event in self._execute_parallel_tools(tool_call, iteration, trace_enabled):
                    yield event

        # ── 达到最大迭代次数 ──
        logger.warning(f"[ReAct] 达到最大工具调用次数限制 ({MAX_TOOL_ITERATIONS})")
        yield {"type": "status", "status": "max_iterations"}

        self.session.messages.append({
            "role": "user",
            "content": "[系统提示] 已达到最大思考轮次限制。请基于已有的工具执行结果，直接给出最终回答，不要再调用工具。",
            "metadata": {"type": "system_feedback"},
        })

        trimmed = _prepare_messages(self.session.messages, self.session.character_id)

        # 静态区替换
        for i, msg in enumerate(trimmed):
            if msg["role"] == "system":
                trimmed[i] = {**msg, "content": static_prompt}
                break

        # 动态区插入
        if dynamic_prompt:
            last_user_idx = _find_last_user_index(trimmed)
            if last_user_idx != -1:
                trimmed = trimmed[:last_user_idx] + [{"role": "system", "content": dynamic_prompt}] + trimmed[last_user_idx:]

        trimmed = _inject_authors_note(trimmed, self.session.session_id)
        response = await chat(trimmed, self.model, stream=True)

        final_reply = ""
        reasoning_buffer_max = ""
        in_think_max = False
        last_chunk_max = None
        async for chunk in response:
            last_chunk_max = chunk
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            # reasoning_content 处理
            reasoning = getattr(delta, 'reasoning_content', None) or getattr(delta, 'reasoning', None)
            if reasoning:
                reasoning_buffer_max += reasoning
                if not in_think_max:
                    yield {"type": "think_start"}
                    in_think_max = True
                yield {"type": "think_content", "content": reasoning}

            chunk_content = delta.content
            if not chunk_content:
                continue
            if in_think_max:
                yield {"type": "think_end"}
                in_think_max = False
            final_reply += chunk_content
            yield {"type": "text", "content": chunk_content}

        if in_think_max:
            yield {"type": "think_end"}
        log_stream_cache_stats(last_chunk_max)
        if last_chunk_max and hasattr(last_chunk_max, 'usage') and last_chunk_max.usage:
            u = last_chunk_max.usage
            record_usage(
                self.session.session_id,
                input_tokens=getattr(u, 'prompt_tokens', 0) or 0,
                output_tokens=getattr(u, 'completion_tokens', 0) or 0,
            )
        clean_reply = _strip_think_tags(final_reply)
        think_meta = reasoning_buffer_max or _extract_think_content(final_reply)
        self.session.messages.append({"role": "assistant", "content": clean_reply})
        meta = {"reasoning_content": think_meta} if think_meta else None
        msg_id = await _save_and_vectorize(
            self.session.session_id or "default", "assistant",
            clean_reply, self.session.character_id, metadata=meta,
        )
        self.session.messages[-1]["id"] = msg_id
        title = None
        if len(self.session.messages) <= 5:
            title = await _auto_title(self.session.session_id)
        done_event: dict = {"type": "done", "exit_reason": "max_iterations", "assistant_db_id": msg_id}
        if title:
            done_event["title"] = title
        yield done_event

    # ── 辅助方法 ──

    async def _resolve_placeholders(self, system_prompt: str) -> tuple[str, bool, set[str]]:
        """解析 system prompt 中的知识库占位符"""
        if not self.config.get("knowledge_enabled", True):
            return system_prompt, False, set()
        try:
            from lumen.prompt.knowledge_resolver import resolve
            resolved_text, has_placeholders, covered_ids, _ = await resolve(
                system_prompt, self.user_input,
                token_budget=self.config.get("knowledge_token_budget", 0) or None,
            )
            if has_placeholders:
                return resolved_text, True, covered_ids
        except Exception as e:
            logger.debug(f"占位符解析跳过: {e}")
        return system_prompt, False, set()

    def _build_layer_infos(self) -> list[dict]:
        """构建分层信息（记忆调试用，从 Agent 的组件 last_output 收集）"""
        infos = []
        if not hasattr(self, '_agent') or not self._agent:
            return infos
        for comp in self._agent.components:
            if comp.last_output:
                infos.append({
                    "name": comp.name,
                    "content": comp.last_output[:200] + "..." if len(comp.last_output) > 200 else comp.last_output,
                    "tokens": estimate_text_tokens(comp.last_output),
                })
        return infos

    async def _execute_single_tool(
        self, tool_call: dict, iteration: int, trace_enabled: bool,
    ) -> AsyncGenerator[dict, None]:
        """执行单个工具调用"""
        from lumen.services.storage import history

        tool_name = tool_call.get("tool", "")
        tool_params = tool_call.get("params", {})
        tool_command = tool_call.get("command", "")

        validation_error = _validate_tool_call(tool_name, tool_params, tool_command)
        if validation_error:
            logger.warning(f"工具验证失败: {validation_error}")
            yield {"type": "status", "status": "tool_error", "message": validation_error}
            self.session.messages.append({"role": "user", "content": f"[系统提示] 你的工具调用有误：{validation_error}。请重新分析用户需求，选择正确的工具和参数。", "metadata": {"type": "system_feedback"}})
            history.save_message(self.session.session_id, "user", f"[系统提示] 你的工具调用有误：{validation_error}。请重新分析用户需求，选择正确的工具和参数。", {"type": "system_feedback"})
            return

        yield {"type": "tool_start", "tool": tool_name, "command": tool_command, "params": tool_params}
        set_tool_context(self.session.session_id or "", self.session.character_id or "",
                         on_room_move=_make_room_move_callback())

        # HookBus: 工具执行前（handler 可修改 params 或阻断）
        try:
            from lumen.core.hook_bus import HookBus
            from lumen.core.hook_types import ToolCallPayload

            tool_call_payload = ToolCallPayload(
                tool_name=tool_name,
                tool_params=dict(tool_params),
                tool_command=tool_command,
                session_id=self.session.session_id or "",
                character_id=self.session.character_id or "",
            )
            await HookBus.get().emit("tool.call", tool_call_payload)
            if tool_call_payload.blocked:
                from lumen.tool import error_result
                from lumen.types.tools import ErrorCode
                tool_result = error_result(tool_name, ErrorCode.PERMISSION_DENIED,
                                            tool_call_payload.block_reason or "工具调用被扩展阻断")
                yield {"type": "tool_result", "tool": tool_name, "command": tool_command,
                       "success": False, "data": None, "error": tool_call_payload.block_reason}
                # 将阻断结果写入消息历史
                self.session.messages.append({
                    "role": "user",
                    "content": format_result_for_ai(tool_result, caller=self.config.get("name", "")),
                    "metadata": {"type": "tool_result", "tool_name": tool_name, "folded": False},
                })
                history.save_message(self.session.session_id, "user",
                    format_result_for_ai(tool_result, caller=self.config.get("name", "")),
                    {"type": "tool_result", "tool_name": tool_name, "folded": False})
                return
            # handler 可能修改了 params
            tool_params = tool_call_payload.tool_params
        except Exception as e:
            logger.warning(f"HookBus tool.call emit failed: {e}")

        tool_exec_start = time.perf_counter()
        try:
            tool_result = await execute_tool(tool_name, tool_params, command=tool_command)
        except Exception as e:
            logger.error(f"工具执行异常: {tool_name} - {e}")
            from lumen.tool import error_result
            from lumen.types.tools import ErrorCode
            tool_result = error_result(tool_name, ErrorCode.EXEC_FAILED, f"工具执行异常: {type(e).__name__}: {e}")

        tool_exec_ms = round((time.perf_counter() - tool_exec_start) * 1000)
        logger.info(f"工具调用: {tool_name}({tool_params}) → {'✅' if tool_result['success'] else '❌'}")

        # HookBus: 工具执行后（handler 可修改结果）
        try:
            from lumen.core.hook_bus import HookBus
            from lumen.core.hook_types import ToolResultPayload

            tool_result_payload = ToolResultPayload(
                tool_name=tool_name,
                tool_params=tool_params,
                tool_command=tool_command,
                result=tool_result,
                duration_ms=tool_exec_ms,
                session_id=self.session.session_id or "",
                character_id=self.session.character_id or "",
            )
            await HookBus.get().emit("tool.result", tool_result_payload)
            # handler 可能修改了 result
            tool_result = tool_result_payload.result
        except Exception as e:
            logger.warning(f"HookBus tool.result emit failed: {e}")

        yield {
            "type": "tool_result",
            "tool": tool_name,
            "command": tool_command,
            "success": tool_result["success"],
            "data": tool_result.get("data"),
            "error": tool_result.get("error_message"),
        }
        if trace_enabled:
            yield {"type": "react_trace", "iteration": iteration, "action": "tool_result", "tool": tool_name, "success": tool_result["success"], "duration_ms": tool_exec_ms}

        # RPG 工具执行后附带房间状态快照
        if tool_name in ("dice", "rpg") and tool_result.get("success"):
            async for evt in self._yield_rpg_state():
                yield evt

        caller_name = self.config.get("name", "")
        self.session.messages.append({
            "role": "user",
            "content": format_result_for_ai(tool_result, caller=caller_name),
            "metadata": {"type": "tool_result", "tool_name": tool_name, "folded": False},
        })
        history.save_message(
            self.session.session_id, "user",
            format_result_for_ai(tool_result, caller=caller_name),
            {"type": "tool_result", "tool_name": tool_name, "folded": False},
        )

    async def _execute_parallel_tools(
        self, tool_call: dict, iteration: int, trace_enabled: bool,
    ) -> AsyncGenerator[dict, None]:
        """执行多个工具并行调用"""
        from lumen.services.storage import history

        calls = tool_call.get("calls", [])
        all_errors = []
        for call in calls:
            error = _validate_tool_call(call.get("tool", ""), call.get("params", {}), call.get("command", ""))
            if error:
                all_errors.append(f"- {call.get('tool')}: {error}")

        if all_errors:
            yield {"type": "status", "status": "tool_error", "message": "并行工具验证失败"}
            error_feedback = "[系统提示] 你的并行工具调用有误：\n" + "\n".join(all_errors) + "\n请重新分析用户需求，选择正确的工具和参数。"
            self.session.messages.append({"role": "user", "content": error_feedback, "metadata": {"type": "system_feedback"}})
            history.save_message(self.session.session_id, "user", error_feedback, {"type": "system_feedback"})
            return

        tool_names = [c.get("tool") for c in calls]
        tool_commands = [c.get("command", "") for c in calls]
        yield {"type": "tool_start", "tool": tool_names, "command": tool_commands, "mode": "parallel"}
        set_tool_context(self.session.session_id or "", self.session.character_id or "",
                         on_room_move=_make_room_move_callback())

        logger.info(f"并行执行 {len(calls)} 个工具...")
        tool_exec_start = time.perf_counter()
        results = await execute_tools_parallel(calls)
        tool_exec_ms = round((time.perf_counter() - tool_exec_start) * 1000)

        for i, r in enumerate(results):
            yield {"type": "tool_result", "tool": r["tool"], "command": calls[i].get("command", "") if i < len(calls) else "", "success": r["success"], "data": r.get("data"), "error": r.get("error_message")}

        # RPG 工具执行后附带房间状态快照
        rpg_results = [r for r in results if r["tool"] in ("dice", "rpg") and r.get("success")]
        if rpg_results:
            async for evt in self._yield_rpg_state():
                yield evt

        if trace_enabled:
            for r in results:
                yield {"type": "react_trace", "iteration": iteration, "action": "tool_result", "tool": r["tool"], "success": r["success"], "duration_ms": tool_exec_ms}

        caller_name = self.config.get("name", "")
        self.session.messages.append({
            "role": "user",
            "content": "\n".join(format_result_for_ai(r, caller=caller_name) for r in results),
            "metadata": {"type": "tool_result_parallel", "tool_count": len(results), "folded": False},
        })
        history.save_message(
            self.session.session_id, "user",
            "\n".join(format_result_for_ai(r, caller=caller_name) for r in results),
            {"type": "tool_result_parallel", "tool_count": len(results), "folded": False},
        )

    async def _yield_rpg_state(self) -> AsyncGenerator[dict, None]:
        """RPG 工具执行后，查询当前角色所在房间状态并 yield rpg_state 事件

        首次调用时自动注册角色到世界（未注册 → 虚空房间）。
        确保每次 dice/rpg 工具调用后前端都能拿到状态快照。
        """
        try:
            from lumen.services.storage import world_state as ws_module
            character_id = self.session.character_id or ""
            if not character_id:
                return
            ws = ws_module
            state = ws.get_agent_state(character_id)
            # 首次使用 RPG 工具：自动注册角色 + 放入虚空房间
            if not state:
                ws.ensure_agent(character_id, name=self.config.get("name", character_id))
                ws.ensure_room("_void", "虚空")
                ws.update_agent(character_id, room_id="_void")
                state = ws.get_agent_state(character_id)
            if not state or not state.get("room_id"):
                return
            room_id = state["room_id"]
            room = ws.get_room(room_id)
            entities = ws.get_room_entities(room_id)
            event: dict = {
                "type": "rpg_state",
                "room_id": room_id,
                "room_name": room.get("name", room_id) if room else room_id,
                "entities": entities,
            }
            # 附带 GM 认知状态（情绪/目标/注意力）
            cog_state = ws.get_cognitive_state(character_id)
            if cog_state:
                event["cognitive_state"] = {
                    k: cog_state[k]
                    for k in ("attention", "goals", "emotions", "emotion_scores", "context_summary")
                    if k in cog_state
                }
            yield event
        except Exception as e:
            logger.debug(f"rpg_state 生成跳过: {e}")
