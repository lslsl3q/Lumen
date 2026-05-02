"""
Lumen - 文本分块器
句子边界感知，支持重叠，用于知识库向量化
"""
import re
import logging
from typing import List

logger = logging.getLogger(__name__)

_BREAK_CHARS = set('。！？；\n.!?;:')


def split_sentences(text: str) -> List[str]:
    """将文本切分为句子列表（中文为主，兼容英文）

    规则：在句末标点（。！？；.!?）和换行处切分，
    保留省略号（……）不切，跳过空句子。
    """
    if not text or not text.strip():
        return []

    # 先把省略号替换为占位符，防止被当成句号切分
    text = text.replace("……", "\x00ELLIPSIS\x00")
    text = text.replace("...", "\x00DOTS\x00")

    # 在句末标点后切分
    parts = re.split(r'([。！？；!?])', text)

    # 重新拼接：标点归入前一句
    sentences = []
    buffer = ""
    for part in parts:
        buffer += part
        if part and part[-1] in '。！？；!?':
            sentences.append(buffer.strip())
            buffer = ""

    # 换行也作为切分点
    if buffer:
        for line in buffer.split('\n'):
            line = line.strip()
            if line:
                sentences.append(line)

    # 恢复省略号
    sentences = [
        s.replace("\x00ELLIPSIS\x00", "……").replace("\x00DOTS\x00", "...")
        for s in sentences
    ]

    # 过滤空句子
    return [s for s in sentences if s.strip()]


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
        if text[i] in _BREAK_CHARS:
            best = i + 1  # 包含标点
    return best if best > search_start else search_end
