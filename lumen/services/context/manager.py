"""
Lumen - 上下文窗口管理
折叠工具调用 + 消息过滤 + 按条数裁剪

未来扩展方向（参考 Claude Code 的四层压缩）：
- summary.py: LLM 摘要压缩（调 API，类似 Claude 的 autocompact）
- tool_cache.py: 工具结果缓存替换（类似 Claude 的 microcompact）
- vector_fold.py: 向量相似度折叠（参考 VCP 的 ContextFoldingV2）
"""

from typing import List, Dict, Any

from lumen.types.messages import Message


# ========================================
# 工具调用折叠
# ========================================

def fold_tool_calls(messages: list[Message]) -> list[Message]:
    """折叠历史工具调用消息对

    检测模式：assistant(工具调用JSON) → user(tool_result) → assistant(最终回答)
    当这个三元组出现时，前两条消息（工具调用 + 工具结果）标记为 folded=True。

    被折叠的消息：
    - 保留在 session.messages 和数据库中（不丢失）
    - filter_for_ai() 会过滤掉它们，不发给 LLM
    - 节省上下文窗口的 token

    Args:
        messages: 原始消息列表（不会被修改）

    Returns:
        新的消息列表（带 folded 标记）
    """
    if len(messages) < 3:
        return messages

    # 浅拷贝每条消息的 dict，避免修改原始数据
    result = []
    for msg in messages:
        new_msg = {**msg}
        # 确保 metadata 是独立的副本
        if "metadata" in new_msg:
            new_msg["metadata"] = {**new_msg["metadata"]}
        result.append(new_msg)

    # 扫描三元组：assistant → user(tool_result) → assistant
    for i in range(len(result) - 2):
        curr = result[i]
        next_msg = result[i + 1]
        next_next = result[i + 2]

        is_tool_pair = (
            curr.get("role") == "assistant"
            and next_msg.get("role") == "user"
            and next_msg.get("metadata", {}).get("type") in ("tool_result", "tool_result_parallel")
            and next_next.get("role") == "assistant"
        )

        if is_tool_pair:
            # 标记这两条消息为已折叠
            result[i].setdefault("metadata", {})["folded"] = True
            result[i + 1].setdefault("metadata", {})["folded"] = True

    return result


def filter_for_ai(messages: list[Message]) -> list[Message]:
    """过滤消息，只发送给 AI 未折叠的

    Args:
        messages: 消息列表

    Returns:
        过滤后的消息列表
    """
    return [
        msg for msg in messages
        if not msg.get("metadata", {}).get("folded", False)
    ]


# ========================================
# 上下文裁剪
# ========================================

def trim_messages(messages: list[Message], max_messages: int = 50) -> list[Message]:
    """截断太长的聊天历史

    保留规则：
    1. 系统提示词（第一条）永远保留
    2. 最新的对话保留
    3. 中间老的对话删掉

    Args:
        messages: 消息列表
        max_messages: 最多保留多少条消息（不算系统提示词）

    Returns:
        裁剪后的消息列表
    """
    if len(messages) <= max_messages + 1:  # +1 是系统提示词
        return messages

    # 第一条是系统提示词，必须保留
    system_msg = messages[0]

    # 只保留最近的消息
    recent = messages[-(max_messages):]

    return [system_msg] + recent
