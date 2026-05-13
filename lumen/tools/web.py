"""
工具：网页搜索、抓取与爬虫
AI 调用这个工具来搜索互联网信息、抓取单页或爬取多页
通过 command 参数分发到 search / fetch / crawl 子命令
"""

import logging
from lumen.tool import success_result, error_result, ErrorCode
from lumen.services.web.search import search_async
from lumen.services.web.fetch import fetch_url, DEFAULT_MAX_LENGTH, MAX_LENGTH_LIMIT
from lumen.services.web.crawler import crawl as crawl_service, CrawlConfig

logger = logging.getLogger(__name__)


# ── 子命令实现 ──────────────────────────────────────────────

async def _cmd_search(params: dict) -> dict:
    """执行网页搜索（含语义重排序）

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
        results = await search_async(query, max_results=max_results, rerank=True)

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


async def _cmd_crawl(params: dict) -> dict:
    """多页爬取，从起始 URL 出发抓取关联页面

    Args:
        params: {"url": "...", "max_pages": 20, "max_depth": 3, "path_prefix": "", "max_content_length": 5000}
    """
    url = params.get("url", "")

    if not url:
        return error_result(
            "web",
            ErrorCode.PARAM_EMPTY,
            "没有提供起始 URL",
            {"provided_params": params}
        )

    if not url.startswith(("http://", "https://")):
        return error_result(
            "web",
            ErrorCode.PARAM_INVALID,
            f"URL 必须以 http:// 或 https:// 开头，收到: {url}",
            {"url": url}
        )

    # 参数解析
    max_pages = params.get("max_pages", 20)
    max_depth = params.get("max_depth", 3)
    max_content_length = params.get("max_content_length", 5000)
    max_total_length = params.get("max_total_length", 0)
    path_prefix = params.get("path_prefix", "")

    try:
        max_pages = max(1, min(int(max_pages), 50))
    except (ValueError, TypeError):
        max_pages = 20
    try:
        max_depth = max(1, min(int(max_depth), 5))
    except (ValueError, TypeError):
        max_depth = 3
    try:
        max_content_length = max(1000, min(int(max_content_length), 20000))
    except (ValueError, TypeError):
        max_content_length = 5000
    try:
        max_total_length = int(max_total_length)
        if max_total_length < 0:
            max_total_length = 0
    except (ValueError, TypeError):
        max_total_length = 0

    config = CrawlConfig(
        max_pages=max_pages,
        max_depth=max_depth,
        max_content_length=max_content_length,
        max_total_length=max_total_length,
        path_prefix=path_prefix,
    )

    try:
        results, stats = await crawl_service(url, config)

        if not results:
            return success_result("web", f"爬取 '{url}' 未获取到任何页面")

        # 格式化结果
        lines = [f"爬取完成：共 {stats.success} 页，耗时 {stats.elapsed_seconds}s\n"]
        if stats.failed:
            lines.append(f"（{stats.failed} 页失败）")
        if stats.skipped_robots:
            lines.append(f"（{stats.skipped_robots} 页被 robots.txt 拦截）")
        if stats.skipped_prefix:
            lines.append(f"（{stats.skipped_prefix} 页不在 path_prefix 范围内）")
        lines.append("")

        for r in results:
            lines.append(f"## {r.title}")
            lines.append(f"URL: {r.url}")
            lines.append(f"深度: {r.depth} | 发现链接: {r.links_found}")
            lines.append(f"---\n{r.content}\n")

        return success_result("web", "\n".join(lines))

    except Exception as e:
        return error_result(
            "web",
            ErrorCode.EXEC_FAILED,
            f"爬取失败: {e}",
            {"url": url, "error_type": type(e).__name__}
        )


# ── 命令映射 ────────────────────────────────────────────────

_COMMAND_MAP = {
    "search": _cmd_search,
    "fetch": _cmd_fetch,
    "crawl": _cmd_crawl,
}


# ── 统一入口 ────────────────────────────────────────────────

async def execute(params: dict, command: str = "") -> dict:
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
    import inspect
    result = handler(params)
    if inspect.iscoroutine(result):
        result = await result
    return result
