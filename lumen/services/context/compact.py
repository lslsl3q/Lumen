"""
Lumen - Compact 服务
上下文压缩：旧消息 → LLM 摘要 → 替换为 system 消息

触发方式：
1. 自动：auto_compact 开启 + token 超过阈值
2. 手动：用户通过 /compact 命令
"""

import json
import logging
from typing import Optional, TYPE_CHECKING

from lumen.config import get_summary_model, get_context_size
from lumen.services.context.token_estimator import estimate_messages_tokens
from lumen.services.context.manager import fold_tool_calls, filter_for_ai
from lumen.services.llm import chat
from lumen.services import history
from lumen.prompt.character import load_character

if TYPE_CHECKING:
    from lumen.core.session import ChatSession

logger = logging.getLogger(__name__)

# 摘要时保留最近的消息数（不会被压缩）
KEEP_RECENT_MESSAGES = 6


def should_compact(session: "ChatSession", character_config: Optional[dict] = None) -> bool:
    """检查是否需要自动 compact"""
    if not character_config:
        character_config = load_character(session.character_id)

    if not character_config.get("auto_compact", False):
        return False

    threshold = character_config.get("compact_threshold", 0.7)
    context_size = get_context_size(character_config)

    folded = fold_tool_calls(session.messages)
    filtered = filter_for_ai(folded)
    current_tokens = estimate_messages_tokens(filtered)

    return current_tokens >= context_size * threshold


async def compact_session(session: "ChatSession") -> dict:
    """执行 compact：旧消息 → LLM 摘要 → 替换

    Returns:
        {"compacted": bool, "tokens_before": int, "tokens_after": int, "summary": str}
    """
    character_config = load_character(session.character_id)
    context_size = get_context_size(character_config)
    model = get_summary_model(character_config)

    folded = fold_tool_calls(session.messages)
    filtered = filter_for_ai(folded)
    tokens_before = estimate_messages_tokens(filtered)

    # 保留：第一条（system prompt）+ 最近 N 条
    if len(session.messages) <= KEEP_RECENT_MESSAGES + 1:
        return {
            "compacted": False,
            "tokens_before": tokens_before,
            "tokens_after": tokens_before,
            "summary": "",
            "reason": "消息太少，无需压缩",
        }

    # 分割：第一条 + 中间（要压缩的）+ 最近 N 条
    system_msg = session.messages[0]
    recent = session.messages[-KEEP_RECENT_MESSAGES:]
    to_summarize = session.messages[1:-KEEP_RECENT_MESSAGES]

    if not to_summarize:
        return {
            "compacted": False,
            "tokens_before": tokens_before,
            "tokens_after": tokens_before,
            "summary": "",
            "reason": "无中间消息可压缩",
        }

    # 生成摘要
    summary = await _generate_compact_summary(to_summarize, model)

    if not summary:
        return {
            "compacted": False,
            "tokens_before": tokens_before,
            "tokens_after": tokens_before,
            "summary": "",
            "reason": "摘要生成失败",
        }

    # 组装新消息列表
    summary_msg = {
        "role": "system",
        "content": f"<compact_summary>\n{summary}\n</compact_summary>",
        "metadata": {"type": "compact_summary", "folded": False},
    }

    new_messages = [system_msg, summary_msg] + recent
    session.messages = new_messages

    # 原子替换数据库
    history.replace_session_messages(session.session_id, new_messages)

    # 计算压缩后的 token
    folded_after = fold_tool_calls(new_messages)
    filtered_after = filter_for_ai(folded_after)
    tokens_after = estimate_messages_tokens(filtered_after)

    logger.info(
        f"Compact 完成: {tokens_before} → {tokens_after} tokens "
        f"(压缩了 {tokens_before - tokens_after})"
    )

    return {
        "compacted": True,
        "tokens_before": tokens_before,
        "tokens_after": tokens_after,
        "summary": summary,
    }


async def _generate_compact_summary(messages: list, model: str) -> str:
    """调 LLM 对中间消息生成紧凑摘要"""
    conversation_text = ""
    for msg in messages:
        role_name = {"user": "用户", "assistant": "AI", "system": "系统"}.get(msg["role"], msg["role"])
        content = msg.get("content", "")
        if content:
            conversation_text += f"{role_name}: {content}\n"

    if not conversation_text.strip():
        return ""

    try:
        response = await chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是对话上下文压缩助手。以下是对话的中间部分，需要压缩成简洁的摘要。\n\n"
                        "摘要必须包含：\n"
                        "- 已讨论的重要话题和结论\n"
                        "- 用户透露的偏好、身份信息\n"
                        "- 未完成的任务或承诺\n"
                        "- 关键的情感或立场变化\n\n"
                        "用中文，控制在 300 字以内。保持客观、信息密集。"
                    ),
                },
                {"role": "user", "content": f"<conversation>\n{conversation_text}</conversation>"},
            ],
            model=model,
            stream=False,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Compact 摘要生成失败: {e}")
        return ""
