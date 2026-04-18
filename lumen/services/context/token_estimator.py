"""
Lumen - Token 计数器
Protocol 接口 + tiktoken 默认实现 + API 校准 + 用量追踪

上层代码通过 estimate_messages_tokens() 使用，不关心底层实现。
以后换实现只需调用 set_counter()。
"""

import logging
from typing import Protocol, Optional, Any

import tiktoken

from lumen.types.messages import Message

logger = logging.getLogger(__name__)


# ========================================
# Protocol 接口（可替换）
# ========================================

class TokenCounter(Protocol):
    """Token 计数器接口"""
    def count_messages_tokens(self, messages: list[Message]) -> int: ...
    def count_text_tokens(self, text: str) -> int: ...


# ========================================
# tiktoken 默认实现
# ========================================

# 模型 → 编码映射（cl100k_base 覆盖 90%+ 主流模型）
_MODEL_ENCODING: dict[str, str] = {
    "gpt-4o": "o200k_base",
    "gpt-4-turbo": "cl100k_base",
    "gpt-4": "cl100k_base",
    "gpt-3.5": "cl100k_base",
}

_DEFAULT_ENCODING = "cl100k_base"

# 角色标签开销（每条消息 +3 token，和 OpenAI 计算方式一致）
_TOKENS_PER_MESSAGE = 3


class TiktokenCounter:
    """基于 tiktoken 的 Token 计数器"""

    def __init__(self, model: str | None = None):
        encoding_name = _MODEL_ENCODING.get(model, _DEFAULT_ENCODING) if model else _DEFAULT_ENCODING
        self._encoding = tiktoken.get_encoding(encoding_name)

    def count_text_tokens(self, text: str) -> int:
        if not text:
            return 0
        return len(self._encoding.encode(text))

    def count_messages_tokens(self, messages: list[Message]) -> int:
        total = 0
        for msg in messages:
            total += _TOKENS_PER_MESSAGE
            content = msg.get("content", "")
            if content:
                total += len(self._encoding.encode(content))
        total += 3  # 对话结束标记
        return total


# ========================================
# 全局单例（可替换）
# ========================================

_counter: TokenCounter = TiktokenCounter()


def get_counter() -> TokenCounter:
    return _counter


def set_counter(counter: TokenCounter):
    global _counter
    _counter = counter


# ========================================
# 便捷函数（上层直接用）
# ========================================

def estimate_messages_tokens(messages: list[Message]) -> int:
    return get_counter().count_messages_tokens(messages)


def estimate_text_tokens(text: str) -> int:
    return get_counter().count_text_tokens(text)


# ========================================
# API 响应 usage 提取（跨厂商字段映射）
# ========================================

def extract_usage(response: Any) -> Optional[dict]:
    """从 LLM API 响应中提取实际 token 用量

    支持的字段格式：
    - OpenAI/GLM: usage.prompt_tokens / usage.completion_tokens
    - Claude: usage.input_tokens / usage.output_tokens

    Returns:
        {"input_tokens": int, "output_tokens": int} 或 None
    """
    usage = getattr(response, "usage", None)
    if usage is None:
        return None

    input_tokens = (
        getattr(usage, "prompt_tokens", None)
        or getattr(usage, "input_tokens", None)
    )
    output_tokens = (
        getattr(usage, "completion_tokens", None)
        or getattr(usage, "output_tokens", None)
    )

    if input_tokens is not None:
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens or 0,
        }
    return None


# ========================================
# 会话级用量追踪
# ========================================

_session_usage: dict[str, dict] = {}


def record_usage(session_id: str, input_tokens: int = 0, output_tokens: int = 0):
    """累积记录会话的 token 消耗"""
    if session_id not in _session_usage:
        _session_usage[session_id] = {"input_tokens": 0, "output_tokens": 0}
    _session_usage[session_id]["input_tokens"] += input_tokens
    _session_usage[session_id]["output_tokens"] += output_tokens


def get_session_usage(session_id: str) -> dict:
    """获取会话的累计 token 用量"""
    return _session_usage.get(session_id, {"input_tokens": 0, "output_tokens": 0})


def clear_session_usage(session_id: str):
    """清除会话用量记录（会话重置时用）"""
    _session_usage.pop(session_id, None)
