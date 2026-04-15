"""
Lumen - 工具调用解析
从 AI 回复文本中提取工具调用 JSON
"""

import json
from typing import Optional


def parse_tool_call(text: str):
    """从 AI 回复中解析工具调用（仅支持新格式）

    新格式要求：
    - 单个工具: {"type": "tool_call", "tool": "xxx", "params": {...}, "timeout": 30}
    - 多个工具: {"type": "tool_call_parallel", "calls": [...]}

    返回格式：
    - 单个工具: {"mode": "single", "tool": "xxx", "params": {...}, "call_id": "..."}
    - 多个工具: {"mode": "parallel", "calls": [...]}
    - 无工具调用: None
    """
    text = text.strip()

    def extract_json(text: str) -> Optional[dict]:
        """从文本中提取 JSON（支持嵌套花括号）"""
        # 尝试直接解析整个文本
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass

        # 找第一个 {，然后匹配对应的 }
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

    # 检查是否包含 type 字段（必须）
    if "type" not in data:
        return None

    msg_type = data.get("type")

    # 单个工具调用
    if msg_type == "tool_call" and "tool" in data:
        result = {
            "mode": "single",
            "tool": data["tool"],
            "params": data.get("params", {})
        }
        if "id" in data:
            result["call_id"] = data["id"]
        if "run_in_background" in data:
            result["run_in_background"] = data["run_in_background"]
        return result

    # 多个工具并行
    if msg_type == "tool_call_parallel" and "calls" in data:
        result = {
            "mode": "parallel",
            "calls": data["calls"]
        }
        if "id" in data:
            result["call_id"] = data["id"]
        return result

    # 未知格式
    return None
