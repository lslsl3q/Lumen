"""
工具：网页抓取
AI 调用这个工具来获取指定 URL 的网页正文内容
"""

import logging
from lumen.tool import success_result, error_result, ErrorCode
from lumen.services.fetch import fetch_url, DEFAULT_MAX_LENGTH, MAX_LENGTH_LIMIT

logger = logging.getLogger(__name__)


def execute(params: dict) -> dict:
    """执行网页抓取

    Args:
        params: {"url": "https://example.com", "max_length": 5000}
    """
    url = params.get("url", "")

    if not url:
        return error_result(
            "web_fetch",
            ErrorCode.PARAM_EMPTY,
            "没有提供 URL",
            {"provided_params": params}
        )

    # 校验 URL 协议
    if not url.startswith(("http://", "https://")):
        return error_result(
            "web_fetch",
            ErrorCode.PARAM_INVALID,
            f"URL 必须以 http:// 或 https:// 开头，收到: {url}",
            {"url": url}
        )

    # 校验 max_length
    max_length = params.get("max_length", DEFAULT_MAX_LENGTH)
    try:
        max_length = int(max_length)
        max_length = max(1000, min(max_length, MAX_LENGTH_LIMIT))
    except (ValueError, TypeError):
        max_length = DEFAULT_MAX_LENGTH

    try:
        result = fetch_url(url, max_length=max_length)

        # 格式化为 AI 友好的文本
        lines = []
        if result["title"]:
            lines.append(f"标题: {result['title']}")
        lines.append(f"链接: {result['url']}")
        lines.append(f"---\n{result['content']}")

        return success_result("web_fetch", "\n".join(lines))

    except Exception as e:
        return error_result(
            "web_fetch",
            ErrorCode.EXEC_FAILED,
            f"抓取网页失败: {e}",
            {"url": url, "error_type": type(e).__name__}
        )
