"""
多页爬虫引擎 — BFS + Worker Pool 并发模型
从起始 URL 出发，提取同域链接，并发爬取多页内容
"""

import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
import lxml.html

from .fetch import _extract_text, fetch_html

logger = logging.getLogger(__name__)

_PROXY = os.getenv("FETCH_PROXY", "")

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


@dataclass
class CrawlConfig:
    max_pages: int = 20
    max_depth: int = 3
    concurrency: int = 3
    delay_per_domain: float = 0.5
    path_prefix: str = ""
    max_content_length: int = 5000
    max_total_length: int = 0  # 0 = 不限制
    respect_robots: bool = True
    timeout_per_page: float = 15.0
    max_elapsed: float = 300.0  # 整体爬取超时（秒）


@dataclass
class CrawlResult:
    url: str
    title: str
    content: str
    depth: int
    links_found: int = 0


@dataclass
class CrawlStats:
    total_urls: int = 0
    success: int = 0
    failed: int = 0
    skipped_robots: int = 0
    skipped_prefix: int = 0
    elapsed_seconds: float = 0.0


class _RobotsChecker:
    """robots.txt 检查器，域名级缓存"""

    def __init__(self):
        self._parsers: dict[str, RobotFileParser] = {}

    async def can_fetch(self, client: httpx.AsyncClient, url: str) -> bool:
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        if base not in self._parsers:
            parser = RobotFileParser()
            try:
                resp = await client.get(f"{base}/robots.txt", timeout=5.0)
                if resp.status_code == 200:
                    parser.parse(resp.text.splitlines())
            except Exception:
                pass  # robots.txt 不可达 → 默认放行
            self._parsers[base] = parser

        return self._parsers[base].can_fetch("*", url)


def _normalize_url(url: str) -> str:
    """URL 归一化：去 fragment + 统一 scheme/host 大小写"""
    url_no_frag, _ = urldefrag(url)
    parsed = urlparse(url_no_frag)
    if not parsed.scheme or not parsed.netloc:
        return ""
    normalized = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{parsed.path}"
    if parsed.query:
        normalized += f"?{parsed.query}"
    return normalized


def _is_html_url(url: str) -> bool:
    """检查 URL 是否指向可提取文本的页面（排除二进制资源）"""
    path = urlparse(url).path
    if "." in path.rsplit("/", 1)[-1]:
        ext = path.rsplit(".", 1)[-1].lower()
        return ext in (
            # HTML 动态页面
            "html", "htm", "xhtml", "shtml",
            "php", "asp", "aspx", "jsp", "cgi",
            # 纯文本格式（可被 _extract_text 处理）
            "md", "txt", "rst", "csv", "xml", "json",
            "",
        )
    return True  # 无扩展名视为页面（如 /docs/）


def _extract_same_domain_links(html_text: str, base_url: str, base_domain: str) -> list[str]:
    """lxml.html 提取同域链接（过滤静态资源）"""
    links = set()
    try:
        tree = lxml.html.fromstring(html_text)
        tree.make_links_absolute(base_url)
        for element, attribute, link, pos in tree.iterlinks():
            if attribute == "href":
                normalized = _normalize_url(link)
                if normalized and normalized.startswith(base_domain) and _is_html_url(normalized):
                    links.add(normalized)
    except Exception as e:
        logger.warning(f"Failed to parse links from {base_url}: {e}")
    return list(links)


def _extract_title(html: str) -> str:
    """从 HTML 提取标题"""
    try:
        tree = lxml.html.fromstring(html)
        title_el = tree.find(".//title")
        if title_el is not None and title_el.text:
            return title_el.text.strip()
    except Exception:
        pass
    return ""


async def crawl(start_url: str, config: CrawlConfig | None = None) -> tuple[list[CrawlResult], CrawlStats]:
    """多页爬取主入口

    使用 Worker Pool 模式（参考 Scrapling engine）：
    主循环持续从队列取 URL → spawn task → _active_tasks 控制
    每个 worker 完成后把新链接推入队列
    """
    if config is None:
        config = CrawlConfig()

    start_time = time.time()
    stats = CrawlStats()
    results: list[CrawlResult] = []

    start_url_norm = _normalize_url(start_url)
    if not start_url_norm:
        return results, stats

    parsed_start = urlparse(start_url_norm)
    base_domain = f"{parsed_start.scheme}://{parsed_start.netloc}"
    prefix_check = urljoin(base_domain, config.path_prefix) if config.path_prefix else ""

    queue: deque[tuple[str, int]] = deque([(start_url_norm, 0)])
    visited: set[str] = {start_url_norm}

    sem = asyncio.Semaphore(config.concurrency)
    robots_checker = _RobotsChecker()
    active_tasks = 0
    total_content_length = 0

    client_kwargs = {
        "verify": False,
        "timeout": config.timeout_per_page,
        "follow_redirects": True,
        "headers": {"User-Agent": _USER_AGENT},
    }
    if _PROXY:
        client_kwargs["proxy"] = _PROXY

    async with httpx.AsyncClient(**client_kwargs) as client:

        async def worker(url: str, depth: int):
            nonlocal total_content_length

            # robots.txt 检查
            if config.respect_robots and not await robots_checker.can_fetch(client, url):
                stats.skipped_robots += 1
                return

            # path_prefix 检查
            if prefix_check and not url.startswith(prefix_check):
                stats.skipped_prefix += 1
                return

            async with sem:
                await asyncio.sleep(config.delay_per_domain)
                html, final_url = await fetch_html(url, client)

            stats.total_urls += 1
            if not html:
                stats.failed += 1
                return

            # 正文提取
            text_result = _extract_text(html, final_url, config.max_content_length)
            content = text_result["content"]
            title = text_result["title"] or _extract_title(html)

            # 提取链接
            links = _extract_same_domain_links(html, final_url, base_domain)

            results.append(CrawlResult(
                url=final_url,
                title=title,
                content=content,
                depth=depth,
                links_found=len(links),
            ))
            stats.success += 1
            total_content_length += len(content)

            # 推入新链接
            if depth < config.max_depth:
                for link in links:
                    if link not in visited:
                        visited.add(link)
                        queue.append((link, depth + 1))

        # Worker Pool 主循环
        tasks: set[asyncio.Task] = set()
        while True:
            # 清理已完成的 task
            done = {t for t in tasks if t.done()}
            tasks -= done
            for t in done:
                if t.exception():
                    logger.error(f"Worker error: {t.exception()}")

            # 检查停止条件
            if not queue and not tasks:
                break

            # 整体超时检查
            if config.max_elapsed > 0 and (time.time() - start_time) >= config.max_elapsed:
                logger.info(f"爬取超时 ({config.max_elapsed}s)，停止抓取")
                break

            # 检查 max_total_length
            if config.max_total_length > 0 and total_content_length >= config.max_total_length:
                # 等待活跃任务完成，不再取新 URL
                if not tasks:
                    break
                await asyncio.sleep(0.05)
                continue

            # 检查 max_pages
            if stats.success >= config.max_pages:
                if not tasks:
                    break
                await asyncio.sleep(0.05)
                continue

            # 从队列取 URL 并 spawn task
            while queue and len(tasks) < config.concurrency:
                if stats.success >= config.max_pages:
                    break
                if config.max_total_length > 0 and total_content_length >= config.max_total_length:
                    break

                url, depth = queue.popleft()
                task = asyncio.create_task(worker(url, depth))
                tasks.add(task)

            # 等一小轮再继续（避免空转）
            if tasks:
                await asyncio.sleep(0.05)
            elif not queue:
                break

    stats.elapsed_seconds = round(time.time() - start_time, 2)
    return results, stats
