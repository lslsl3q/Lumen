"""
Lumen - 上下文管理
防止聊天历史太长导致API报错，自动截断老消息
"""

from typing import List, Dict, Any


# ========================================
# 折叠接口（预留，以后实现）
# ========================================

def fold_tool_calls(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """折叠历史工具调用消息 - NOT YET IMPLEMENTED

    此功能已预留接口，等待实现。当前直接返回原消息列表。

    原理：
    1. 检测工具调用对（assistant tool_call + user tool_result）
    2. 如果下一条 assistant 消息存在（说明 AI 已输出结果）
    3. 标记 tool_result 消息为 folded=True

    折叠的消息：
    - 保留在数据库中
    - 前端可以展开查看
    - 不发送给 AI

    Args:
        messages: 原始消息列表

    Returns:
        标记后的消息列表（原列表的浅拷贝）
    """
    # TODO: 待实现 - 当前直接返回原列表
    return messages


def filter_for_ai(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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

def trim_messages(messages: List[Dict[str, Any]], max_messages: int = 50) -> List[Dict[str, Any]]:
    """截断太长的聊天历史

    保留规则：
    1. 系统提示词（第一条）永远保留
    2. 最新的对话保留
    3. 中间老的对话删掉

    未来优化：
    - 先调用 fold_tool_calls() 折叠历史工具调用
    - 再按数量裁剪

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
