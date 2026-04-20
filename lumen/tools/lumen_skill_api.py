"""
Lumen - Skill 脚本工具 API

提供给 skill 脚本 import 的轻量工具接口。
脚本通过环境变量 LUMEN_ROOT 自动找到此模块。

用法（在 skill 脚本中）：
    import sys, os
    sys.path.insert(0, os.environ["LUMEN_ROOT"])
    from lumen.tools.lumen_skill_api import search, fetch, read_file

    results = search("关键词")
    html = fetch(results[0]["url"])
    content = read_file("/path/to/file")
"""
import os
import logging

logger = logging.getLogger(__name__)


def _call_tool(name: str, params: dict) -> str:
    """调用 Lumen 工具，返回 data 字符串"""
    from lumen.tools.base import execute_tool
    result = execute_tool(name, params)
    if not result.get("success"):
        raise RuntimeError(f"工具 {name} 执行失败: {result.get('error_message', '未知错误')}")
    return result.get("data", "")


def search(query: str, max_results: int = 5) -> str:
    """网页搜索（DuckDuckGo）

    Args:
        query: 搜索关键词
        max_results: 最多返回条数

    Returns:
        格式化搜索结果文本
    """
    return _call_tool("web_search", {"query": query, "max_results": max_results})


def fetch(url: str, max_length: int = 5000) -> str:
    """抓取网页内容

    Args:
        url: 目标 URL
        max_length: 最大返回字符数

    Returns:
        网页文本内容
    """
    return _call_tool("web_fetch", {"url": url, "max_length": max_length})


def read_file(path: str) -> str:
    """读取文件内容

    Args:
        path: 文件路径

    Returns:
        文件文本内容
    """
    return _call_tool("file_read", {"action": "read", "path": path})


def list_files(path: str, pattern: str = "*") -> str:
    """列出目录中的文件

    Args:
        path: 目录路径
        pattern: glob 匹配模式

    Returns:
        格式化文件列表文本
    """
    return _call_tool("file_read", {"action": "list", "path": path, "pattern": pattern})


def calculate(expression: str) -> str:
    """计算数学表达式

    Args:
        expression: 数学表达式

    Returns:
        计算结果
    """
    return _call_tool("calculate", {"expression": expression})
