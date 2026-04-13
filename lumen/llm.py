"""
Lumen - LLM 适配器层
统一不同厂商的调用格式，方便扩展支持多种模型
"""

from .config import client


def chat(messages: list, model: str, stream: bool = False):
    """统一聊天接口

    Args:
        messages: 消息列表，格式 [{"role": "user", "content": "..."}, ...]
        model: 模型名称
        stream: 是否流式输出

    Returns:
        stream=False: 返回完整响应对象（response.choices[0].message.content）
        stream=True: 返回迭代器（for chunk in response）

    注意：
        当前只支持 OpenAI 兼容格式（DeepSeek、通义、Gemini 等）
        以后需要支持 Anthropic 等其他厂商时，在这里添加对应的适配器
    """
    # TODO: 以后根据 model 名称前缀选择不同适配器
    # if model.startswith("claude-"):
    #     return _anthropic_chat(messages, model, stream)
    # elif model.startswith("gemini-"):
    #     return _gemini_chat(messages, model, stream)
    # else:
    #     return _openai_chat(messages, model, stream)

    # 当前：默认使用 OpenAI 兼容格式
    return _openai_chat(messages, model, stream)


def _openai_chat(messages: list, model: str, stream: bool = False):
    """OpenAI 兼容格式适配器

    支持的厂商：
    - OpenAI 官方
    - DeepSeek
    - 通义千问
    - Gemini（通过 OpenAI 兼容接口）
    - 其他使用 OpenAI 格式的 API
    """
    return client.chat.completions.create(
        model=model,
        messages=messages,
        stream=stream,
    )


# 未来可以添加更多适配器：
# def _anthropic_chat(messages, model, stream):
#     from anthropic import Anthropic
#     client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
#     ...
#
# def _gemini_chat(messages, model, stream):
#     import google.generativeai as genai
#     ...
