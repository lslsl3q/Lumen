"""
工具：网页搜索与抓取
AI 调用这个工具来搜索互联网信息或获取指定 URL 的网页正文内容
通过 command 参数分发到 search / fetch 子命令
"""

import logging
from lumen.tool import success_result, error_result, ErrorCode
from lumen.services.search import search
from lumen.services.fetch import fetch_url, DEFAULT_MAX_LENGTH, MAX_LENGTH_LIMIT

logger = logging.getLogger(__name__)


# ── 子命令实现 ──────────────────────────────────────────────

def _cmd_search(params: dict) -> dict:
    """执行网页搜索

    Args:
        params: {"query": "搜索关键词", "max_results": 5}
    """
    query = params.get("query", "")

    if not query:
        return error_result(
            "web",
            ErrorCode.PARAM_EMPTY,
            "没有提供搜索关键词",
            {"provided_params": params}
        )

    max_results = params.get("max_results", 5)
    try:
        max_results = int(max_results)
        max_results = max(1, min(max_results, 10))  # 限制 1-10
    except (ValueError, TypeError):
        max_results = 5

    try:
        results = search(query, max_results=max_results)

        if not results:
            return success_result("web", f"搜索 '{query}' 未找到结果")

        # 格式化为 AI 友好的文本
        lines = [f"搜索 '{query}' 共找到 {len(results)} 条结果：\n"]
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. {r['title']}")
            lines.append(f"   链接: {r['url']}")
            lines.append(f"   摘要: {r['snippet']}\n")

        return success_result("web", "\n".join(lines))

    except Exception as e:
        return error_result(
            "web",
            ErrorCode.EXEC_FAILED,
            f"搜索失败: {e}",
            {"query": query, "error_type": type(e).__name__}
        )


def _cmd_fetch(params: dict) -> dict:
    """执行网页抓取

    Args:
        params: {"url": "https://example.com", "max_length": 5000}
    """
    url = params.get("url", "")

    if not url:
        return error_result(
            "web",
            ErrorCode.PARAM_EMPTY,
            "没有提供 URL",
            {"provided_params": params}
        )

    # 校验 URL 协议
    if not url.startswith(("http://", "https://")):
        return error_result(
            "web",
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

        return success_result("web", "\n".join(lines))

    except Exception as e:
        return error_result(
            "web",
            ErrorCode.EXEC_FAILED,
            f"抓取网页失败: {e}",
            {"url": url, "error_type": type(e).__name__}
        )


# ── 命令映射 ────────────────────────────────────────────────

_COMMAND_MAP = {
    "search": _cmd_search,
    "fetch": _cmd_fetch,
}


# ── 统一入口 ────────────────────────────────────────────────

def execute(params: dict, command: str = "") -> dict:
    """统一入口：根据 command 分发到 search / fetch

    Args:
        params:  工具参数（query / url / max_results / max_length）
        command: 子命令名称，"search" 或 "fetch"
    """
    handler = _COMMAND_MAP.get(command)
    if handler is None:
        return error_result(
            "web",
            ErrorCode.PARAM_INVALID,
            f"未知子命令 '{command}'，可选: {', '.join(_COMMAND_MAP)}",
            {"command": command}
        )
    return handler(params)
