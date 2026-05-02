"""
Lumen - LLM 适配器层
统一不同厂商的调用格式，方便扩展支持多种模型
"""
import logging
from typing import Any, Optional

from lumen.config import client, LLM_TIMEOUT
from lumen.types.messages import Message

logger = logging.getLogger(__name__)


def build_thinking_params(model: str, thinking_cfg: dict | None) -> tuple[dict, str | None]:
    """根据模型和思考配置，翻译成对应的 API 参数

    返回 (extra_body, reasoning_effort)，供 chat() 使用。
    thinking_cfg 为 None 或 enabled=False 时返回空字典和 None。
    """
    if not thinking_cfg or not thinking_cfg.get("enabled"):
        return {}, None

    budget = thinking_cfg.get("budget_tokens", 1024)
    model_low = model.lower()
    extra_body = {}
    reasoning_effort = None

    # Claude 3.7+: 结构化思考 + budget_tokens
    if "claude" in model_low:
        extra_body["thinking"] = {
            "type": "enabled",
            "budget_tokens": budget,
        }

    # DeepSeek V4/V3: extra_body 开启 + 顶层 reasoning_effort
    # DeepSeek 官方文档：low/medium 映射为 high，xhigh 映射为 max
    # 所以只使用 high 和 max 两档
    elif "deepseek" in model_low:
        extra_body["thinking"] = {"type": "enabled"}
        reasoning_effort = "max" if budget >= 16000 else "high"

    # Kimi K2.6: chat_template_kwargs
    elif "kimi" in model_low or "moonshot" in model_low:
        extra_body["chat_template_kwargs"] = {"thinking": True}

    # GLM 5.x: thinking extra_body
    elif "glm" in model_low:
        extra_body["thinking"] = {"type": "enabled"}

    # OpenAI o-series / GPT-5: 顶层 reasoning_effort
    elif any(x in model_low for x in ("gpt-5", "o1", "o3")):
        if budget >= 8000:
            reasoning_effort = "high"
        else:
            reasoning_effort = "medium"

    # Qwen: thinking extra_body (DeepSeek 风格)
    elif "qwen" in model_low:
        extra_body["thinking"] = {"type": "enabled"}

    return extra_body, reasoning_effort


async def chat(messages: list[Message], model: str, stream: bool = False,
               extra_body: Optional[dict[str, Any]] = None, reasoning_effort: Optional[str] = None,
               temperature: Optional[float] = None, max_tokens: Optional[int] = None,
               response_format: Optional[dict[str, Any]] = None):
    """统一聊天接口（异步版）

    所有 LLM 调用都应走此函数，确保统一的日志、超时、错误处理。

    Args:
        messages: 消息列表
        model: 模型名称
        stream: 是否流式输出
        extra_body: 透传给 API body 的额外字段（如 thinking 配置）
        reasoning_effort: 推理强度（low/medium/high/max），用于 OpenAI/DeepSeek
        temperature: 采样温度，None 使用模型默认值
        max_tokens: 最大输出 token 数，None 使用模型默认值
        response_format: 响应格式，如 {"type": "json_object"}

    Returns:
        stream=False: 返回完整响应对象
        stream=True: 返回异步迭代器
    """
    kwargs: dict[str, Any] = dict(
        model=model,
        messages=messages,
        stream=stream,
        timeout=LLM_TIMEOUT,
    )
    if extra_body:
        kwargs["extra_body"] = extra_body
    if reasoning_effort:
        kwargs["reasoning_effort"] = reasoning_effort
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if response_format is not None:
        kwargs["response_format"] = response_format

    logger.info(f"[LLM] 调用 API: model={model}, stream={stream}, "
                f"messages_count={len(messages)}, temperature={temperature}, "
                f"max_tokens={max_tokens}, response_format={response_format}")

    try:
        response = await client.chat.completions.create(**kwargs)
    except Exception as e:
        logger.error(f"[LLM ERROR] API 调用失败: {type(e).__name__}: {str(e)}")
        logger.error(f"[LLM ERROR] 请求参数: model={model}, stream={stream}, "
                     f"temperature={temperature}, max_tokens={max_tokens}")
        if messages:
            first_msg = messages[0]
            content_preview = str(first_msg.get('content', ''))[:200].replace('\n', '\\n')
            logger.error(f"[LLM ERROR] 第一条消息: role={first_msg.get('role')}, content={content_preview}...")
        raise

    # 非流式：直接记录缓存命中
    if not stream:
        usage = getattr(response, 'usage', None)
        if usage:
            _log_cache_stats_from_usage(usage)

    return response


def _log_cache_stats(response):
    """记录 API 响应中的缓存命中信息"""
    usage = getattr(response, 'usage', None)
    if usage:
        _log_cache_stats_from_usage(usage)


def log_stream_cache_stats(chunk):
    """流式响应的最后一个 chunk 可能带 usage，记录缓存命中"""
    if not chunk:
        return
    usage = getattr(chunk, 'usage', None)
    if usage:
        _log_cache_stats_from_usage(usage)


def _log_cache_stats_from_usage(usage):
    """从 usage 对象记录缓存统计"""
    cached = getattr(usage, 'prompt_cache_hit_tokens', None) or 0

    if not cached:
        details = getattr(usage, 'prompt_tokens_details', None)
        if details:
            cached = getattr(details, 'cached_tokens', None) or 0

    total_input = getattr(usage, 'prompt_tokens', 0)

    if total_input > 0 and cached > 0:
        ratio = round(cached / total_input * 100, 1)
        logger.info(f"[LLM Cache] 命中 {cached}/{total_input} tokens ({ratio}%), "
                    f"未命中 {total_input - cached}")
    elif total_input > 0:
        logger.info(f"[LLM Cache] 未命中缓存, 全部 {total_input} tokens 为新内容")
