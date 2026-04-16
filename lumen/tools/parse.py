"""
Lumen - 工具调用解析
从 AI 回复文本中提取工具调用 JSON，Pydantic 校验后返回 dict
"""

import json
from typing import Optional, Dict, Any

from lumen.types.tools import SingleToolCall, ParallelToolCall


def parse_tool_call(text: str) -> Optional[Dict[str, Any]]:
    """从 AI 回复中解析工具调用

    新格式要求：
    - 单个工具: {"type": "tool_call", "tool": "xxx", "params": {...}}
    - 多个工具: {"type": "tool_call_parallel", "calls": [...]}

    返回：
    - 解析成功：标准化的 dict（经 Pydantic 校验）
    - 无工具调用：None
    """
    text = text.strip()

    def extract_json(text: str) -> Optional[dict]:
        """从文本中提取 JSON（支持嵌套花括号）"""
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass

        start_idx = text.find('{')
        if start_idx < 0:
            return None

        brace_count = 0
        in_string = False
        escape = False
        for i in range(start_idx, len(text)):
            char = text[i]

            if escape:
                escape = False
                continue
            if char == '\\':
                escape = True
                continue

            if char == '"':
                in_string = not in_string
                continue

            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_str = text[start_idx:i+1]
                        try:
                            return json.loads(json_str)
                        except (json.JSONDecodeError, ValueError):
                            pass
                        break
        return None

    data = extract_json(text)
    if not data or not isinstance(data, dict):
        return None

    if "type" not in data:
        return None

    msg_type = data.get("type")

    # 单个工具调用 — Pydantic 校验
    if msg_type == "tool_call" and "tool" in data:
        call = SingleToolCall(
            mode="single",
            tool=data["tool"],
            params=data.get("params", {}),
        )
        if "id" in data:
            call.call_id = data["id"]
        if "run_in_background" in data:
            call.run_in_background = data["run_in_background"]
        return call.model_dump(exclude_none=True)

    # 多个工具并行 — Pydantic 校验
    if msg_type == "tool_call_parallel" and "calls" in data:
        parallel = ParallelToolCall(
            mode="parallel",
            calls=data["calls"],
        )
        if "id" in data:
            parallel.call_id = data["id"]
        return parallel.model_dump(exclude_none=True)

    return None
