"""
Lumen - 世界书匹配引擎

扫描聊天内容，匹配关键词，返回注入内容
"""
import re
import logging
from typing import List, Dict, Optional
import unicodedata

logger = logging.getLogger(__name__)


def _contains_cjk(text: str) -> bool:
    """检查文本是否包含 CJK 字符（中日韩统一表意文字）"""
    for ch in text:
        if '\u4e00' <= ch <= '\u9fff' or '\u3400' <= ch <= '\u4dbf' or '\uf900' <= ch <= '\ufaff':
            return True
    return False


def compile_keyword_pattern(keyword: str, case_sensitive: bool, whole_word: bool) -> re.Pattern:
    """编译关键词匹配模式

    全词匹配策略：
    - 纯 ASCII 关键词：使用 \\b 单词边界
    - 含 CJK 字符：\\b 对中文无效，改用前后不允许 CJK 字符的断言
    """
    flags = 0 if case_sensitive else re.IGNORECASE

    if whole_word:
        if _contains_cjk(keyword):
            # CJK 全词匹配：前后不能是 CJK 字符（\b 对中文无效）
            cjk_range = '\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff'
            pattern = f'(?<![{cjk_range}])' + re.escape(keyword) + f'(?![{cjk_range}])'
        else:
            pattern = r'\b' + re.escape(keyword) + r'\b'
    else:
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

        # 检查主关键词是否匹配
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

        if not is_matched:
            continue

        # 次关键词条件检查
        if entry.get("selective", False):
            secondary_keywords = entry.get("secondary_keywords", [])
            logic = entry.get("selective_logic", "and")

            if secondary_keywords:
                secondary_matched = False
                for kw in secondary_keywords:
                    pattern = compile_keyword_pattern(kw, case_sensitive, whole_word)
                    for msg in recent_messages:
                        if pattern.search(msg.get("content", "")):
                            secondary_matched = True
                            break
                    if secondary_matched:
                        break

                if logic == "and" and not secondary_matched:
                    continue  # AND 模式：次关键词没命中 → 跳过
                elif logic == "not" and secondary_matched:
                    continue  # NOT 模式：次关键词命中了 → 跳过

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
