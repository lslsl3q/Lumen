"""
Lumen - 上下文管理
防止聊天历史太长导致API报错，自动截断老消息
"""


def trim_messages(messages: list, max_messages: int = 50) -> list:
    """截断太长的聊天历史

    保留规则：
    1. 系统提示词（第一条）永远保留
    2. 最新的对话保留
    3. 中间老的对话删掉

    max_messages: 最多保留多少条消息（不算系统提示词）
    """
    if len(messages) <= max_messages + 1:  # +1 是系统提示词
        return messages

    # 第一条是系统提示词，必须保留
    system_msg = messages[0]

    # 只保留最近的消息
    recent = messages[-(max_messages):]

    return [system_msg] + recent
