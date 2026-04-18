"""
Lumen - 记忆系统
会话结束时生成摘要，新会话开始时注入记忆
"""

import logging

from lumen.services import history
from lumen.services.llm import chat
from lumen.types.messages import Message

logger = logging.getLogger(__name__)


async def generate_summary(messages: list[Message]) -> str:
    """调 AI 给一段对话生成摘要

    messages: 当前会话的消息列表（会去掉 system 消息）
    返回: 摘要文本，失败返回空字符串
    """
    # 只取用户和AI的对话，去掉 system 消息
    chat_msgs = [m for m in messages if m["role"] != "system"]

    if not chat_msgs:
        return ""

    # 把对话拼成文本，让 AI 做摘要
    conversation_text = ""
    for msg in chat_msgs:
        role_name = "用户" if msg["role"] == "user" else "AI"
        conversation_text += f"{role_name}: {msg['content']}\n"

    # 调 AI 生成摘要
    try:
        from lumen.config import get_summary_model
        model = get_summary_model()

        response = await chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个对话摘要助手。请根据以下对话内容，提取关键信息并生成简洁的摘要。\n"
                        "摘要应该包含：\n"
                        "- 用户的偏好、特征、兴趣\n"
                        "- 讨论的主要话题\n"
                        "- 重要的结论或决定\n"
                        "用中文，控制在2-3句话以内。"
                    ),
                },
                {"role": "user", "content": f"<conversation>\n{conversation_text}</conversation>"},
            ],
            model=model,
            stream=False,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # 摘要失败不影响正常使用，记录错误后静默跳过
        logger.error(f"摘要生成失败: {e}")
        return ""


async def summarize_session(session_id: str, character_id: str, messages: list[Message]):
    """给一个会话生成摘要并保存到数据库"""
    summary = await generate_summary(messages)
    if summary:
        history.save_summary(session_id, character_id, summary)
        logger.info(f"已保存会话 {session_id} 的摘要")


def get_memory_context(character_id: str) -> str:
    """读取记忆并拼成注入文本

    返回格式化的记忆文本，没有记忆时返回空字符串
    """
    summaries = history.load_summaries(character_id, limit=3)

    if not summaries:
        return ""

    # 拼成 XML 格式
    lines = []
    for session_id, summary in summaries:
        lines.append(f"会话 {session_id}: {summary}")

    memory_text = "<memory>\n<过去的对话摘要>\n" + "\n".join(lines) + "\n</过去的对话摘要>\n</memory>"
    return memory_text
