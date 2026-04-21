"""
工具：网页搜索
AI 调用这个工具来搜索互联网信息
"""

import logging
from lumen.tool import success_result, error_result, ErrorCode
from lumen.services.search import search

logger = logging.getLogger(__name__)


def execute(params: dict) -> dict:
    """执行网页搜索

    Args:
        params: {"query": "搜索关键词", "max_results": 5}
    """
    query = params.get("query", "")

    if not query:
        return error_result(
            "web_search",
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
            return success_result("web_search", f"搜索 '{query}' 未找到结果")

        # 格式化为 AI 友好的文本
        lines = [f"搜索 '{query}' 共找到 {len(results)} 条结果：\n"]
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. {r['title']}")
            lines.append(f"   链接: {r['url']}")
            lines.append(f"   摘要: {r['snippet']}\n")

        return success_result("web_search", "\n".join(lines))

    except Exception as e:
        return error_result(
            "web_search",
            ErrorCode.EXEC_FAILED,
            f"搜索失败: {e}",
            {"query": query, "error_type": type(e).__name__}
        )
