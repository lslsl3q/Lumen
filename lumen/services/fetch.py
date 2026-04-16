"""
网页抓取服务 — 基础设施层
负责 HTTP 请求和正文提取，工具入口只做参数校验和结果格式化
"""

import os
import logging
from typing import Optional

import httpx
import trafilatura

logger = logging.getLogger(__name__)

# 从环境变量读取代理配置
_PROXY = os.getenv("FETCH_PROXY", "")

# 伪装为 Chrome，避免被简单反爬拦截
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# 超时设置（秒）
_TIMEOUT = 15

# 最大默认长度
DEFAULT_MAX_LENGTH = 5000
MAX_LENGTH_LIMIT = 10000


def fetch_url(url: str, max_length: int = DEFAULT_MAX_LENGTH) -> dict:
    """抓取网页并提取正文内容

    Args:
        url: 目标网页 URL
        max_length: 返回内容的最大字符数

    Returns:
        {"title": "页面标题", "content": "正文文本", "url": "原始链接"}

    Raises:
        ValueError: URL 格式无效
        RuntimeError: 请求失败或内容为空
    """
    # 1. 发送 HTTP 请求
    headers = {"User-Agent": _USER_AGENT}
    client_kwargs = {
        "headers": headers,
        "timeout": _TIMEOUT,
        "follow_redirects": True,
    }
    if _PROXY:
        client_kwargs["proxy"] = _PROXY

    with httpx.Client(**client_kwargs) as client:
        response = client.get(url)

    if response.status_code != 200:
        raise RuntimeError(f"HTTP {response.status_code}: 请求网页失败")

    html = response.text

    # 2. 检查是否为 HTML 内容
    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        # 非 HTML 内容（PDF、图片等），直接返回原始文本（截断）
        raw_text = html[:max_length]
        if len(html) > max_length:
            raw_text += f"\n\n[内容已截断，原始长度 {len(html)} 字符]"
        return {
            "title": "",
            "content": raw_text,
            "url": url,
        }

    # 3. 用 trafilatura 提取正文
    metadata = trafilatura.extract(html, output_format="json", include_comments=False, with_metadata=True)
    content = trafilatura.extract(html, include_comments=False)

    # 提取标题（优先从 metadata 取）
    title = ""
    if metadata:
        import json
        try:
            meta = json.loads(metadata)
            title = meta.get("title", "")
        except (json.JSONDecodeError, TypeError):
            pass

    if not content:
        # trafilatura 提取失败，回退到去标签的纯文本
        from html.parser import HTMLParser

        class _TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self._texts: list[str] = []
                self._skip = False

            def handle_starttag(self, tag, attrs):
                if tag in ("script", "style", "noscript"):
                    self._skip = True

            def handle_endtag(self, tag):
                if tag in ("script", "style", "noscript"):
                    self._skip = False

            def handle_data(self, data):
                if not self._skip:
                    text = data.strip()
                    if text:
                        self._texts.append(text)

        extractor = _TextExtractor()
        extractor.feed(html)
        content = "\n".join(extractor._texts) or "无法提取页面内容"

    # 4. 截断
    original_length = len(content)
    if len(content) > max_length:
        content = content[:max_length]
        content += f"\n\n[内容已截断，原始长度 {original_length} 字符]"

    logger.info(f"[fetch] 抓取 '{url}' 成功，内容长度 {original_length}")

    return {
        "title": title,
        "content": content,
        "url": url,
    }
