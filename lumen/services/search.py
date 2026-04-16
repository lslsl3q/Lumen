"""
搜索服务 — 基础设施层
后端可切换，工具入口不用改
"""

import os
import logging
from typing import List, Dict

from lumen.services.types import SearchResult

logger = logging.getLogger(__name__)

# 从环境变量读取代理配置（国内需要代理才能访问 DuckDuckGo）
_PROXY = os.getenv("SEARCH_PROXY", "")


def _duckduckgo_search(query: str, max_results: int = 5) -> list[SearchResult]:
    """DuckDuckGo 搜索后端

    Returns:
        [{"title": "标题", "url": "链接", "snippet": "摘要"}, ...]
    """
    from ddgs import DDGS

    ddgs_kwargs = {}
    if _PROXY:
        ddgs_kwargs["proxy"] = _PROXY

    with DDGS(**ddgs_kwargs) as ddgs:
        results = list(ddgs.text(query, max_results=max_results))

    formatted = []
    for r in results:
        formatted.append({
            "title": r.get("title", ""),
            "url": r.get("href", ""),
            "snippet": r.get("body", ""),
        })

    logger.info(f"[DuckDuckGo] 搜索 '{query}' 返回 {len(formatted)} 条结果")
    return formatted


# 当前使用的搜索后端（以后换 Searxng 只改这里）
_default_backend = "duckduckgo"

_backends = {
    "duckduckgo": _duckduckgo_search,
    # "searxng": _searxng_search,  # 以后加
}


def search(query: str, max_results: int = 5, backend: str = None) -> list[SearchResult]:
    """搜索互联网

    Args:
        query: 搜索关键词
        max_results: 最大结果数
        backend: 指定后端（默认用配置的后端）

    Returns:
        [{"title": "标题", "url": "链接", "snippet": "摘要"}, ...]
    """
    backend_name = backend or _default_backend
    backend_fn = _backends.get(backend_name)
    if not backend_fn:
        raise ValueError(f"未知搜索后端: {backend_name}，可用: {list(_backends.keys())}")
    return backend_fn(query, max_results=max_results)
