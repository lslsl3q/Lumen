"""
Lumen - 服务层专用类型
搜索结果、会话信息等
"""

from typing import TypedDict


class SearchResult(TypedDict):
    """搜索结果条目"""
    title: str
    url: str
    snippet: str


class SessionInfo(TypedDict):
    """会话列表项"""
    session_id: str
    character_id: str
    created_at: str
