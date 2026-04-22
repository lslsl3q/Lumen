"""
Lumen - 文本分块器
句子边界感知，支持重叠，用于知识库向量化
"""
import re
import logging
from typing import List

logger = logging.getLogger(__name__)

_SENTENCE_BREAKS = re.compile(r'[。！？；\n.!?\;]')


def chunk_text(
    text: str,
    chunk_size: int = 300,
    overlap: int = 60,
) -> List[str]:
    """将文本按句子边界切分为带重叠的 chunk

    Args:
        text: 原始文本
        chunk_size: 目标 chunk 字符数（实际会按句子边界微调）
        overlap: 重叠字符数

    Returns:
        chunk 字符串列表
    """
    if not text or not text.strip():
        return []

    text = text.strip()

    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # 还没到末尾时，向前找句子边界
        if end < len(text):
            search_start = start + chunk_size // 2
            boundary = _find_sentence_break(text, search_start, end)
            if boundary > start:
                end = boundary

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        # 下一个起点：往回退 overlap，对齐到句子边界
        next_start = max(start + 1, end - overlap)
        boundary = _find_sentence_break(text, next_start, end)
        if boundary > next_start and boundary < end:
            next_start = boundary
        if next_start <= start:
            next_start = end
        start = next_start

    return chunks


def _find_sentence_break(text: str, search_start: int, search_end: int) -> int:
    """在 [search_start, search_end) 范围内找最后一个句子边界"""
    best = -1
    for i in range(search_start, min(search_end, len(text))):
        if _SENTENCE_BREAKS.match(text[i]):
            best = i + 1  # 包含标点
    return best if best > search_start else search_end
