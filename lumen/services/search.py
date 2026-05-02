"""
搜索服务 — 基础设施层
后端可切换，工具入口不用改
支持语义重排序：搜索结果用嵌入模型按相关性重排，过滤低质量结果
"""

import asyncio
import logging
import math
import os
from typing import List

from lumen.services.types import SearchResult

logger = logging.getLogger(__name__)

# 从环境变量读取代理配置（国内需要代理才能访问 DuckDuckGo）
_PROXY = os.getenv("SEARCH_PROXY", "")

# 重排序配置
_RERANK_ENABLED = os.getenv("SEARCH_RERANK_ENABLED", "True").lower() in ("true", "1", "yes")
_RERANK_TOP_K = int(os.getenv("SEARCH_RERANK_TOP_K", "5"))
_RERANK_MIN_SCORE = float(os.getenv("SEARCH_RERANK_MIN_SCORE", "0.3"))


def _duckduckgo_search(query: str, max_results: int = 5) -> list[SearchResult]:
    """DuckDuckGo 搜索后端"""
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


async def _rerank_results(query: str, results: list[SearchResult], top_k: int, min_score: float) -> list[SearchResult]:
    """用嵌入模型对搜索结果做语义重排序

    流程：query 向量和每条结果的 (title + snippet) 向量算余弦相似度 → 按分数重排 → 过滤低分

    注意：首次调用会加载嵌入模型（可能耗时），有超时保护，超时则降级返回原始结果。
    """
    import asyncio
    from lumen.services.embedding import get_service

    _RERANK_TIMEOUT = float(os.getenv("SEARCH_RERANK_TIMEOUT", "15"))

    try:
        scored = await asyncio.wait_for(
            _do_rerank(query, results),
            timeout=_RERANK_TIMEOUT,
        )
        if scored is None:
            return results

        # 过滤低分 + 截断
        scored.sort(key=lambda x: x[0], reverse=True)
        filtered = []
        for score, r in scored:
            if score < min_score:
                logger.debug(f"[搜索重排] 过滤低相关结果: {r['title'][:30]} (score={score:.3f})")
                continue
            r["score"] = round(score, 3)
            filtered.append(r)
            if len(filtered) >= top_k:
                break

        logger.info(f"[搜索重排] {len(results)} 条 → {len(filtered)} 条 (阈值={min_score})")
        return filtered

    except asyncio.TimeoutError:
        logger.warning(f"[搜索重排] 重排序超时 ({_RERANK_TIMEOUT}s)，降级返回原始结果")
        return results
    except Exception as e:
        logger.warning(f"[搜索重排] 重排序失败 ({type(e).__name__}: {e})，降级返回原始结果")
        return results


async def _do_rerank(query: str, results: list[SearchResult]) -> list[tuple[float, dict]] | None:
    """执行实际的重排序编码和相似度计算，返回 [(score, result_dict), ...] 或 None"""
    from lumen.services.embedding import get_service

    backend = await get_service("memory")
    if not backend:
        return None

    query_vec = await backend.encode(query)
    if not query_vec:
        return None

    texts = [f"{r['title']}。{r['snippet']}" for r in results]
    vectors = await backend.encode_batch(texts)
    if not vectors:
        return None

    scored: list[tuple[float, dict]] = []
    for i, vec in enumerate(vectors):
        dot = sum(a * b for a, b in zip(query_vec, vec))
        norm_q = math.sqrt(sum(x * x for x in query_vec))
        norm_r = math.sqrt(sum(x * x for x in vec))
        score = dot / (norm_q * norm_r) if norm_q > 0 and norm_r > 0 else 0.0
        scored.append((score, dict(results[i])))

    return scored


# 当前使用的搜索后端
_default_backend = "duckduckgo"

_backends = {
    "duckduckgo": _duckduckgo_search,
}


async def search_async(query: str, max_results: int = 5, backend: str = None, rerank: bool = True) -> list[SearchResult]:
    """搜索互联网（异步版，支持语义重排序）

    Args:
        query: 搜索关键词
        max_results: 最终返回的最大结果数
        backend: 指定后端
        rerank: 是否启用语义重排序

    Returns:
        [{"title", "url", "snippet", "score"(可选)}, ...]
    """
    backend_name = backend or _default_backend
    backend_fn = _backends.get(backend_name)
    if not backend_fn:
        raise ValueError(f"未知搜索后端: {backend_name}，可用: {list(_backends.keys())}")

    # 搜索时多取一些（给重排序留余量）
    fetch_count = max_results * 2 if (rerank and _RERANK_ENABLED) else max_results

    # 带超时的搜索（防止 DuckDuckGo 代理挂死整条链）
    _SEARCH_TIMEOUT = float(os.getenv("SEARCH_TIMEOUT", "30"))
    try:
        results = await asyncio.wait_for(
            asyncio.to_thread(backend_fn, query, fetch_count),
            timeout=_SEARCH_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning(f"搜索超时 ({_SEARCH_TIMEOUT}s): '{query}'")
        return []

    if not results:
        return []

    # 语义重排序
    if rerank and _RERANK_ENABLED:
        results = await _rerank_results(query, results, top_k=max_results, min_score=_RERANK_MIN_SCORE)

    return results


def search(query: str, max_results: int = 5, backend: str = None) -> list[SearchResult]:
    """搜索互联网（同步版，向后兼容，无重排序）"""
    backend_name = backend or _default_backend
    backend_fn = _backends.get(backend_name)
    if not backend_fn:
        raise ValueError(f"未知搜索后端: {backend_name}，可用: {list(_backends.keys())}")
    return backend_fn(query, max_results=max_results)
