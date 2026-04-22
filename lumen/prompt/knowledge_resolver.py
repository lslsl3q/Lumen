"""
Lumen - 知识库占位符解析器
解析 system_prompt 中的占位符，检索后替换

语法：
  {{分类名}}     — 全文注入（加载分类下所有文件）
  [[分类名]]     — RAG 语义检索（按用户输入搜索相关片段）
  [[文件名.md]]  — 精确到文件的 RAG 检索

匹配规则：占位符名称 → category 精确匹配 / filename 包含匹配 / source_path 包含匹配
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 占位符正则（优先匹配 {{}}，再匹配 [[]]，避免嵌套冲突）
_RE_FULLTEXT = re.compile(r'\{\{(.*?)\}\}')
_RE_RAG = re.compile(r'\[\[(.*?)\]\]')


def parse_placeholders(text: str) -> list[dict]:
    """解析文本中的所有知识库占位符

    Returns:
        [{"match": "[[世界观]]", "name": "世界观", "mode": "rag"}, ...]
    """
    found = []

    for m in _RE_FULLTEXT.finditer(text):
        found.append({"match": m.group(0), "name": m.group(1).strip(), "mode": "fulltext"})

    for m in _RE_RAG.finditer(text):
        found.append({"match": m.group(0), "name": m.group(1).strip(), "mode": "rag"})

    return found


def _match_files(name: str) -> list[dict]:
    """按名称匹配知识库文件（category 精确匹配 / filename / source_path 包含匹配）"""
    from lumen.services.knowledge import list_files

    entries = list_files()

    # 1. category 精确匹配
    matched = [e for e in entries if e.get("category") == name]
    if matched:
        return matched

    # 2. filename 包含匹配
    matched = [e for e in entries if name in e.get("filename", "")]
    if matched:
        return matched

    # 3. source_path 包含匹配
    matched = [e for e in entries if name in e.get("source_path", "")]
    return matched


async def _resolve_fulltext(name: str, token_budget: int = 800) -> tuple[str, set[str]]:
    """全文注入：加载匹配文件的所有内容。返回 (结果文本, 已覆盖的 file_id 集合)"""
    from lumen.services.context.token_estimator import estimate_text_tokens

    matched = _match_files(name)
    if not matched:
        logger.debug(f"知识库占位符 {{ {name} }}: 无匹配文件")
        return "", set()

    covered_ids = set()
    parts = []
    used_tokens = 0

    for entry in matched:
        source_path = entry.get("source_path", "")
        if not source_path:
            continue

        from lumen.services.knowledge import KNOWLEDGE_SOURCE_DIR
        import os
        full_path = os.path.join(KNOWLEDGE_SOURCE_DIR, source_path)
        if not os.path.exists(full_path):
            continue

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
        except IOError:
            continue

        entry_text = f"[来源: {entry['filename']}]\n{content}"
        entry_tokens = estimate_text_tokens(entry_text)

        if used_tokens + entry_tokens > token_budget:
            break
        parts.append(entry_text)
        used_tokens += entry_tokens
        covered_ids.add(entry.get("id", ""))

    if not parts:
        return "", set()

    return (
        f"[--- 知识库「{name}」全文内容 ---]\n"
        + "\n\n".join(parts)
        + "\n[--- 全文内容结束 ---]",
        covered_ids,
    )


async def _resolve_rag(name: str, query: str, top_k: int = 5, token_budget: int = 500) -> tuple[str, set[str]]:
    """RAG 检索：按名称过滤后语义搜索。返回 (结果文本, 已覆盖的 file_id 集合)"""
    from lumen.services.knowledge import search as knowledge_search
    from lumen.services.context.token_estimator import estimate_text_tokens

    # 判断是 category 名还是 filename
    from lumen.services.knowledge import list_files
    entries = list_files()
    category_match = [e for e in entries if e.get("category") == name]
    filename_match = [e for e in entries if name in e.get("filename", "")]

    # 确定搜索过滤条件
    category_filter = None
    file_id_filter = None
    if category_match:
        category_filter = name
    elif filename_match:
        # 按文件名匹配时，用 file_id 过滤
        file_id_filter = [e["id"] for e in filename_match]

    # 搜索
    if file_id_filter:
        # 按文件 ID 过滤：搜索全部再用 file_id 过滤
        results = await knowledge_search(query, top_k=top_k * 3, min_score=0.2)
        results = [r for r in results if r.get("file_id") in file_id_filter][:top_k]
    else:
        results = await knowledge_search(query, top_k=top_k, min_score=0.2, category=category_filter)

    if not results:
        logger.debug(f"知识库占位符 [[{name}]]: 无检索结果")
        return "", set()

    # Token 预算控制
    parts = []
    covered_ids = set()
    used_tokens = 0

    for hit in results:
        filename = hit.get("filename", "未知来源")
        content = hit.get("content", "")
        score = hit.get("score", 0)

        entry = f"[来源: {filename}，相关度: {score:.2f}]\n{content}"
        entry_tokens = estimate_text_tokens(entry)

        if used_tokens + entry_tokens > token_budget:
            break
        parts.append(entry)
        used_tokens += entry_tokens
        covered_ids.add(hit.get("file_id", ""))

    if not parts:
        return "", set()

    return (
        f"[--- 知识库「{name}」检索结果 ---]\n"
        + "\n\n".join(parts)
        + "\n[--- 检索结果结束 ---]",
        covered_ids,
    )


async def resolve(text: str, query: str, token_budget: int = 800) -> tuple[str, bool, set[str]]:
    """解析并替换文本中的所有知识库占位符

    Args:
        text: 包含占位符的文本（通常是 system_prompt）
        query: 当前用户输入（用于 RAG 检索）
        token_budget: 总 token 预算（所有占位符共享）

    Returns:
        (替换后的文本, 是否有占位符被解析, 已覆盖的 file_id 集合)
    """
    placeholders = parse_placeholders(text)
    if not placeholders:
        return text, False, set()

    resolved = text
    remaining_budget = token_budget
    covered_file_ids: set[str] = set()

    for ph in placeholders:
        name = ph["name"]
        mode = ph["mode"]

        if mode == "fulltext":
            result, ids = await _resolve_fulltext(name, token_budget=remaining_budget)
        else:
            result, ids = await _resolve_rag(name, query, token_budget=remaining_budget)

        if result:
            resolved = resolved.replace(ph["match"], result, 1)
            from lumen.services.context.token_estimator import estimate_text_tokens
            remaining_budget -= estimate_text_tokens(result)
            remaining_budget = max(remaining_budget, 0)
            covered_file_ids.update(ids)
        else:
            # 无结果 → 移除占位符
            resolved = resolved.replace(ph["match"], "", 1)

    logger.info(f"知识库占位符解析: {len(placeholders)} 个，已替换")
    return resolved, True, covered_file_ids
