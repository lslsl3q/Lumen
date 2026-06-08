"""
子代理输出管理 — 截断 + 文件输出

当子代理输出超过阈值时：
1. 截断 in-context 输出（返回给主 Agent 的摘要）
2. 完整输出写入文件（可后续查看）
"""

import logging
import os
from typing import Any
from datetime import datetime

logger = logging.getLogger(__name__)

# 输出阈值：超过此长度触发截断
_MAX_OUTPUT_CHARS = 30_000  # ~30KB，约 7500 tokens
# 截断后保留的前后比例
_TAIL_RATIO = 0.2  # 20% 留给尾部

_OUTPUT_DIR = os.path.expanduser("~/.lumen/subagent_output")


def _ensure_dir():
    os.makedirs(_OUTPUT_DIR, exist_ok=True)


def manage_output(
    output: str,
    run_id: str,
    threshold: int = _MAX_OUTPUT_CHARS,
) -> dict[str, Any]:
    """管理子代理输出：截断 + 文件保存

    Args:
        output: 原始输出
        run_id: 运行 ID
        threshold: 截断阈值（字符数）

    Returns:
        {
            "output": str,       # 截断后的输出（或原样）
            "truncated": bool,   # 是否被截断
            "output_file": str,  # 完整输出文件路径（截断时）
            "full_length": int,  # 原始输出长度
        }
    """
    full_length = len(output)

    if full_length <= threshold:
        return {
            "output": output,
            "truncated": False,
            "output_file": "",
            "full_length": full_length,
        }

    # 截断：保留头部 + 尾部
    head_size = int(threshold * (1 - _TAIL_RATIO))
    tail_size = threshold - head_size

    head = output[:head_size]
    tail = output[-tail_size:] if tail_size > 0 else ""

    truncated = f"{head}\n\n... [截断: {full_length - threshold} 字符省略] ...\n\n{tail}"

    # 保存完整输出到文件
    _ensure_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{run_id}_{timestamp}.txt"
    filepath = os.path.join(_OUTPUT_DIR, filename)

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(output)
        logger.info(f"Full output saved to {filepath} ({full_length} chars)")
    except IOError as e:
        logger.error(f"Failed to save output file: {e}")
        filepath = ""

    return {
        "output": truncated,
        "truncated": True,
        "output_file": filepath,
        "full_length": full_length,
    }
