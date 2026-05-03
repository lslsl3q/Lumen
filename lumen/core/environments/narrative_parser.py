"""GM 叙事解析器 — 从 LLM 输出提取 JSON 中的 narrative 字段"""

import re
import json
import logging

logger = logging.getLogger(__name__)

# 匹配 ```json ... ``` 或 ``` ... ``` 代码块
_MARKDOWN_CODE_BLOCK = re.compile(r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL)


def strip_markdown_codeblock(text: str) -> str:
    """剥离 markdown 代码块包装，返回内部内容"""
    m = _MARKDOWN_CODE_BLOCK.search(text)
    if m:
        return m.group(1).strip()
    return text.strip()


def parse_narrative(llm_output: str) -> dict:
    """解析 LLM 输出，提取裁决 JSON

    Returns:
        {
            "success": bool,       # JSON 是否解析成功
            "narrative": str,      # 叙事文本（解析失败时返回原始文本）
            "full_result": dict|None,  # 完整 JSON（解析成功时）
        }
    """
    cleaned = strip_markdown_codeblock(llm_output)

    try:
        result = json.loads(cleaned)
        if not isinstance(result, dict):
            raise ValueError("JSON 不是对象")

        narrative = result.get("narrative", "")
        if not narrative:
            # 尝试从 outcome 或 most_likely_outcome 兜底
            narrative = result.get("most_likely_outcome", result.get("outcome", llm_output))

        return {
            "success": True,
            "narrative": narrative,
            "full_result": result,
        }
    except (json.JSONDecodeError, ValueError) as e:
        logger.debug(f"GM JSON 解析失败，降级为纯文本: {e}")
        return {
            "success": False,
            "narrative": cleaned,
            "full_result": None,
        }
