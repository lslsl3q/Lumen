"""
Lumen - LLM 适配器层
统一不同厂商的调用格式，方便扩展支持多种模型
"""

from lumen.config import client, LLM_TIMEOUT
from lumen.types.messages import Message


async def chat(messages: list[Message], model: str, stream: bool = False):
    """统一聊天接口（异步版）

    Args:
        messages: 消息列表，格式 [{"role": "user", "content": "..."}, ...]
        model: 模型名称
        stream: 是否流式输出

    Returns:
        stream=False: 返回完整响应对象（response.choices[0].message.content）
        stream=True: 返回异步迭代器（async for chunk in response）

    注意：
        当前只支持 OpenAI 兼容格式（DeepSeek、通义、Gemini 等）
        以后需要支持 Anthropic 等其他厂商时，在这里添加对应的适配器
    """
    # 当前：默认使用 OpenAI 兼容格式（异步）
    return await _openai_chat(messages, model, stream)


async def _openai_chat(messages: list[Message], model: str, stream: bool = False):
    """OpenAI 兼容格式适配器（异步版）

    支持的厂商：
    - OpenAI 官方
    - DeepSeek
    - 通义千问
    - Gemini（通过 OpenAI 兼容接口）
    - 其他使用 OpenAI 格式的 API

    Args:
        messages: 消息列表
        model: 模型名称
        stream: 是否流式输出

    超时设置：
        默认 60 秒，可通过环境变量 LLM_TIMEOUT 调整
    """
    return await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=stream,
        timeout=LLM_TIMEOUT,
    )
