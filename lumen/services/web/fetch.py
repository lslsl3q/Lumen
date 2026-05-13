"""
网页抓取服务 — 基础设施层
负责 HTTP 请求和正文提取，工具入口只做参数校验和结果格式化
"""

import os
import logging
from html.parser import HTMLParser
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


class _TextExtractor(HTMLParser):
    """HTML 去标签提取纯文本的 fallback 解析器"""

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


def _extract_text(html: str, url: str, max_length: int) -> dict:
    """从 HTML 提取正文 + 标题（完整 fallback 链）

    Returns:
        {"title": str, "content": str}
    """
    if not html:
        return {"title": "", "content": ""}

    # 1. trafilatura 提取正文 + metadata 标题
    metadata = trafilatura.extract(html, output_format="json", include_comments=False, with_metadata=True)
    content = trafilatura.extract(html, include_comments=False)

    title = ""
    if metadata:
        import json
        try:
            meta = json.loads(metadata)
            title = meta.get("title", "")
        except (json.JSONDecodeError, TypeError):
            pass

    # 2. trafilatura 失败 → HTMLParser 去标签 fallback
    if not content:
        extractor = _TextExtractor()
        extractor.feed(html)
        content = "\n".join(extractor._texts) or "无法提取页面内容"

    # 3. 截断
    original_length = len(content)
    if len(content) > max_length:
        content = content[:max_length]
        content += f"\n\n[内容已截断，原始长度 {original_length} 字符]"

    return {"title": title, "content": content}


async def fetch_html(url: str, client: httpx.AsyncClient) -> tuple[Optional[str], str]:
    """底层 HTTP 请求，返回 (HTML文本, 最终URL)

    不做内容提取，由调用方决定如何处理。
    """
    try:
        response = await client.get(url)
        response.raise_for_status()
        # 确保编码正确
        if not response.charset_encoding:
            response.encoding = "utf-8"
        return response.text, str(response.url)
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP {e.response.status_code} fetching {url}")
        return None, url
    except Exception as e:
        logger.error(f"Network error fetching {url}: {e}")
        return None, url


def fetch_url(url: str, max_length: int = DEFAULT_MAX_LENGTH) -> dict:
    """抓取网页并提取正文内容（同步接口，工具层直接调用）

    Args:
        url: 目标网页 URL
        max_length: 返回内容的最大字符数

    Returns:
        {"title": "页面标题", "content": "正文文本", "url": "原始链接"}
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

    # 3. 提取正文（复用 _extract_text 的完整 fallback 链）
    result = _extract_text(html, url, max_length)
    result["url"] = url

    logger.info(f"[fetch] 抓取 '{url}' 成功，内容长度 {len(result['content'])}")

    return result
