"""
Lumen - 世界书匹配引擎

扫描聊天内容，匹配关键词，返回注入内容
"""
import re
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


def compile_keyword_pattern(keyword: str, case_sensitive: bool, whole_word: bool) -> re.Pattern:
    """编译关键词匹配模式"""
    flags = 0 if case_sensitive else re.IGNORECASE

    if whole_word:
        # 全词匹配：使用单词边界
        pattern = r'\b' + re.escape(keyword) + r'\b'
    else:
        # 部分匹配
        pattern = re.escape(keyword)

    return re.compile(pattern, flags)


def match_worldbooks(
    messages: List[Dict],
    character_id: str,
    entries: List[Dict]
) -> List[Dict]:
    """匹配世界书条目

    Args:
        messages: 聊天消息列表
        character_id: 当前角色ID
        entries: 所有世界书条目列表

    Returns:
        匹配成功的条目列表，按 order 和 depth 排序
    """
    matched = []

    # 过滤启用的条目
    enabled_entries = [e for e in entries if e.get("enabled", True)]

    for entry in enabled_entries:
        # 角色过滤
        character_ids = entry.get("character_ids", [])
        if character_ids and character_id not in character_ids:
            continue

        # 获取扫描范围
        scan_depth = entry.get("scan_depth", 10)
        recent_messages = messages[-scan_depth:] if scan_depth > 0 else messages

        # 编译匹配模式
        keywords = entry.get("keywords", [])
        if not keywords:
            continue

        case_sensitive = entry.get("case_sensitive", False)
        whole_word = entry.get("whole_word", True)

        # 检查是否匹配
        is_matched = False
        for keyword in keywords:
            pattern = compile_keyword_pattern(keyword, case_sensitive, whole_word)
            for msg in recent_messages:
                content = msg.get("content", "")
                if pattern.search(content):
                    is_matched = True
                    break
            if is_matched:
                break

        if is_matched:
            matched.append(entry)

    # 按 order（优先级）和 depth（深度）排序
    matched.sort(key=lambda x: (x.get("order", 0), x.get("depth", 4)))

    return matched


def get_injection_context(
    messages: List[Dict],
    character_id: str,
    entries: Optional[List[Dict]] = None
) -> List[Dict]:
    """获取要注入的动态上下文

    Args:
        messages: 聊天消息列表
        character_id: 当前角色ID
        entries: 世界书条目列表（None时自动加载）

    Returns:
        动态上下文列表，格式：
        [{
            "content": "注入内容",
            "injection_point": "before_user",
            "depth": 4,
            "order": 0
        }]
    """
    if entries is None:
        from lumen.prompt.worldbook_store import list_worldbooks
        entries = list_worldbooks()

    matched = match_worldbooks(messages, character_id, entries)

    # 转换为动态上下文格式
    contexts = []
    for entry in matched:
        contexts.append({
            "content": entry.get("content", ""),
            "injection_point": entry.get("position", "before_user"),
            "depth": entry.get("depth", 4),
            "order": entry.get("order", 0)
        })

    return contexts
