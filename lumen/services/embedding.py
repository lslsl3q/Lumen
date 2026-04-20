"""
Lumen - 嵌入服务
单例懒加载 SentenceTransformer，用于记忆系统的语义搜索
"""

import logging
import os
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

_model = None
_loaded = False
_failed = False
_lock = asyncio.Lock()


def _get_proxy() -> str:
    """获取 HuggingFace 下载代理"""
    return os.getenv("FETCH_PROXY", "") or os.getenv("SEARCH_PROXY", "") or os.getenv("HTTPS_PROXY", "")


def _load_model():
    """同步加载模型（在线程中执行，不阻塞事件循环）"""
    global _model, _loaded, _failed

    if _loaded or _failed:
        return

    try:
        from lumen.config import EMBEDDING_MODEL, EMBEDDING_ENABLED

        if not EMBEDDING_ENABLED:
            logger.info("嵌入搜索已禁用 (EMBEDDING_ENABLED=False)")
            _failed = True
            return

        proxy = _get_proxy()
        if proxy:
            os.environ["HTTP_PROXY"] = proxy
            os.environ["HTTPS_PROXY"] = proxy

        from sentence_transformers import SentenceTransformer

        logger.info(f"正在加载嵌入模型: {EMBEDDING_MODEL}...")
        _model = SentenceTransformer(EMBEDDING_MODEL)
        _loaded = True
        logger.info(f"嵌入模型加载完成: {EMBEDDING_MODEL}")

    except ImportError:
        logger.warning("sentence-transformers 未安装，语义搜索不可用")
        _failed = True
    except Exception as e:
        logger.error(f"嵌入模型加载失败: {e}")
        _failed = True


def is_available() -> bool:
    """检查嵌入服务是否可用"""
    return _loaded and _model is not None


async def ensure_loaded():
    """确保模型已加载（线程安全，只加载一次）"""
    if _loaded or _failed:
        return
    async with _lock:
        if _loaded or _failed:
            return
        await asyncio.to_thread(_load_model)


async def encode(text: str) -> Optional[list[float]]:
    """编码单条文本，返回 512 维向量

    Returns:
        向量列表，模型不可用返回 None
    """
    await ensure_loaded()
    if not is_available():
        return None

    try:
        vector = await asyncio.to_thread(_model.encode, text, show_progress_bar=False)
        return vector.tolist()
    except Exception as e:
        logger.error(f"嵌入编码失败: {e}")
        return None


async def encode_batch(texts: list[str]) -> Optional[list[list[float]]]:
    """编码多条文本，返回向量列表

    Returns:
        向量列表，模型不可用返回 None
    """
    if not texts:
        return []
    await ensure_loaded()
    if not is_available():
        return None

    try:
        vectors = await asyncio.to_thread(_model.encode, texts, show_progress_bar=False)
        return vectors.tolist()
    except Exception as e:
        logger.error(f"批量嵌入编码失败: {e}")
        return None
