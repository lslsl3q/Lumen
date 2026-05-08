"""
Lumen - Cross-Encoder Rerank 服务

多服务商运行时配置 + 通用 Rerank API 调用 + 超时保护 + 优雅回退。
支持 SiliconFlow、智谱、Jina、Cohere 等所有兼容 `/rerank` 接口的服务商。

配置优先级：data/rerank_providers.json > .env SILICONFLOW_API_KEY > .env ZHIPU_API_KEY
"""

import asyncio
import json
import logging
import time
from pathlib import Path

import httpx

from lumen.config import (
    KNOWLEDGE_RERANK_ENABLED,
    KNOWLEDGE_RERANK_TOP_K,
    KNOWLEDGE_RERANK_MIN_SCORE,
    ZHIPU_API_KEY,
    SILICONFLOW_API_KEY,
)

logger = logging.getLogger(__name__)

# ── 运行时配置 ──

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "rerank_providers.json"
_runtime_config: dict | None = None


def _load_config() -> dict | None:
    """加载 rerank_providers.json，返回 active=true 的第一个服务商配置。"""
    global _runtime_config
    if _runtime_config is not None:
        return _runtime_config

    if _CONFIG_PATH.exists():
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            active_id = data.get("active_provider", "")
            providers = data.get("providers", [])
            for p in providers:
                if p.get("id") == active_id and p.get("api_key") and p.get("api_url") and p.get("model"):
                    _runtime_config = {
                        **p,
                        "top_k": data.get("top_k", KNOWLEDGE_RERANK_TOP_K),
                        "min_score": data.get("min_score", KNOWLEDGE_RERANK_MIN_SCORE),
                        "enabled": data.get("enabled", KNOWLEDGE_RERANK_ENABLED),
                    }
                    return _runtime_config
            logger.debug("rerank_providers.json 中无 active_provider 匹配")
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"读取 rerank_providers.json 失败: {e}")

    return None


def get_active_provider() -> dict | None:
    """返回当前活跃的 rerank 服务商配置，无可用配置时返回 None。

    优先级：rerank_providers.json > .env SILICONFLOW_API_KEY > .env ZHIPU_API_KEY
    """
    if not KNOWLEDGE_RERANK_ENABLED:
        return None

    # 1. JSON 配置文件
    cfg = _load_config()
    if cfg:
        return cfg

    # 2. .env SILICONFLOW_API_KEY（SiliconFlow 默认端点）
    if SILICONFLOW_API_KEY:
        return {
            "name": "SiliconFlow (env)",
            "api_url": "https://api.siliconflow.cn/v1/rerank",
            "api_key": SILICONFLOW_API_KEY,
            "model": "BAAI/bge-reranker-v2-m3",
            "top_k": KNOWLEDGE_RERANK_TOP_K,
            "min_score": KNOWLEDGE_RERANK_MIN_SCORE,
            "max_doc_chars": 0,
        }

    # 3. .env ZHIPU_API_KEY（智谱默认端点）
    if ZHIPU_API_KEY:
        return {
            "name": "Zhipu (env)",
            "api_url": "https://open.bigmodel.cn/api/paas/v4/rerank",
            "api_key": ZHIPU_API_KEY,
            "model": "rerank",
            "top_k": KNOWLEDGE_RERANK_TOP_K,
            "min_score": KNOWLEDGE_RERANK_MIN_SCORE,
            "max_doc_chars": 4000,
        }

    return None


def reload_rerank_config():
    """清除缓存的配置 — API 保存新配置后调用。"""
    global _runtime_config
    _runtime_config = None


# ── Rerank API 调用 ──


def _call_rerank_api(provider: dict, query: str, documents: list[str], top_n: int) -> dict:
    """同步调用 rerank API（在 asyncio.to_thread 中运行）。"""
    resp = httpx.post(
        provider["api_url"],
        headers={
            "Authorization": f"Bearer {provider['api_key']}",
            "Content-Type": "application/json",
        },
        json={
            "model": provider["model"],
            "query": query,
            "documents": documents,
            "top_n": top_n,
        },
        timeout=8,
        verify=False,  # Windows SSL workaround
    )
    resp.raise_for_status()
    return resp.json()


async def _do_rerank(
    query: str,
    results: list[dict],
    provider: dict,
    top_k: int,
    min_score: float,
) -> list[dict]:
    """执行 rerank 并映射回原始结果。"""
    # Per-provider doc char limit (0 = no limit)
    limit = provider.get("max_doc_chars", 0)
    documents = [
        r.get("content", "")[:limit] if limit else r.get("content", "")
        for r in results
    ]

    resp = await asyncio.to_thread(
        _call_rerank_api, provider, query, documents, top_k
    )

    # Map API results back to original results
    reranked = []
    for r in resp.get("results", []):
        idx = r.get("index", -1)
        score = r.get("relevance_score", 0)
        if 0 <= idx < len(results) and score >= min_score:
            result = dict(results[idx])
            result["rerank_score"] = score
            reranked.append(result)

    # 如果 rerank 后结果为空（所有分数都低于阈值），回退原始排序
    return reranked if reranked else results[:top_k]


async def rerank_knowledge_results(
    query: str,
    results: list[dict],
    top_k: int | None = None,
    min_score: float | None = None,
) -> list[dict]:
    """用 Cross-Encoder 对搜索结果重排序。失败时回退原始排序。

    Args:
        query: 用户查询文本
        results: 搜索结果列表（每个 dict 需有 content 字段）
        top_k: 返回 top-K 条，默认用配置值
        min_score: 最低相关性分数阈值，默认用配置值

    Returns:
        重排序后的结果列表（原顺序为 fallback）
    """
    provider = get_active_provider()
    if provider is None:
        return results

    top_k = top_k or provider.get("top_k", KNOWLEDGE_RERANK_TOP_K)
    min_score = min_score or provider.get("min_score", KNOWLEDGE_RERANK_MIN_SCORE)

    if not results:
        return results

    try:
        return await asyncio.wait_for(
            _do_rerank(query, results, provider, top_k, min_score),
            timeout=10,
        )
    except asyncio.TimeoutError:
        logger.warning("Rerank 超时，回退原始排序")
        return results[:top_k]
    except Exception as e:
        logger.warning(f"Rerank 失败，回退原始排序: {e}")
        return results[:top_k]


# ── 连通性测试 ──


def test_rerank_connection(provider: dict) -> dict:
    """测试指定服务商的连通性。

    Args:
        provider: 服务商配置 dict（需含 api_url, api_key, model）

    Returns:
        {success, latency_ms, results, usage, error}
    """
    query = "什么是人工智能"
    documents = ["人工智能是计算机科学的一个分支", "今天天气很好"]

    start = time.time()
    try:
        resp = _call_rerank_api(provider, query, documents, 2)
        latency = int((time.time() - start) * 1000)
        return {
            "success": True,
            "latency_ms": latency,
            "results": resp.get("results", []),
            "usage": resp.get("meta", {}).get("tokens", resp.get("usage", {})),
        }
    except Exception as e:
        return {"success": False, "latency_ms": 0, "error": str(e)}
