"""
Lumen - 工具调用解析
从 AI 回复文本中提取工具调用 JSON，支持 JSON 修复和结构检测
"""

import json
import re
from typing import Optional, Dict, Any, Tuple

from lumen.types.tools import SingleToolCall, ParallelToolCall


# 已知的工具调用 JSON 开头模式
_TOOL_CALL_PREFIXES = (
    '{"type": "tool_call"',
    '{"type":"tool_call"',
    '{"type": "tool_call_parallel"',
    '{"type":"tool_call_parallel"',
    '{"tool":',
    '{"tool" :',
    '{"calls":',
    '{"calls" :',
)


def _looks_like_tool_call(buffer: str) -> Optional[bool]:
    """判断流式 buffer 是否像工具调用

    Returns:
        True  = 确定是工具调用（匹配到已知前缀）
        False = 确定不是（非 JSON 开头）
        None  = 还不确定，需要更多 token
    """
    stripped = buffer.strip()
    if not stripped:
        return None

    first = stripped[0]

    if first == '{':
        for prefix in _TOOL_CALL_PREFIXES:
            if stripped.startswith(prefix):
                return True
        # { 开头但还没匹配模式 → 等更多 token
        if len(stripped) < 40:
            return None
        # 超过 40 字符还没匹配 → 大概率是普通 JSON 回复
        return False

    # 非 { 开头 → 确定不是工具调用
    return False


def _repair_json(text: str) -> str:
    """修复 LLM 常见的 JSON 格式错误

    处理：尾逗号、缺少闭合引号/花括号
    """
    # 1. 去掉尾逗号（, } 或 , ] → } 或 ]）
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # 2. 修复单引号 → 双引号（只在完全没有双引号时）
    if "'" in text and '"' not in text:
        text = text.replace("'", '"')

    # 3. 修复缺少闭合花括号
    open_count = 0
    close_count = 0
    in_str = False
    escaped = False
    for ch in text:
        if escaped:
            escaped = False
            continue
        if ch == '\\':
            escaped = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if not in_str:
            if ch == '{':
                open_count += 1
            elif ch == '}':
                close_count += 1
    if open_count > close_count:
        text += '}' * (open_count - close_count)

    return text


def _extract_brace_content(text: str) -> Optional[str]:
    """从文本中提取最外层花括号内容（支持嵌套）"""
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
                    return text[start_idx:i + 1]

    return None


def extract_json(text: str) -> Tuple[Optional[dict], str]:
    """从文本中提取并解析 JSON

    Returns:
        (parsed_dict_or_None, error_detail_str)
    """
    text = text.strip()

    # 容错：残缺 JSON（缺少开头的 {）
    if text.startswith('type"') or text.startswith('type":'):
        text = '{"' + text
    elif text.startswith('"type"') or text.startswith('"type":'):
        text = '{' + text

    # 第一次尝试：直接解析全文
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data, ""
    except (json.JSONDecodeError, ValueError):
        pass

    # 第二次尝试：提取花括号内容
    json_str = _extract_brace_content(text)
    if json_str:
        try:
            data = json.loads(json_str)
            if isinstance(data, dict):
                return data, ""
        except (json.JSONDecodeError, ValueError):
            pass

        # 第三次尝试：修复后解析
        repaired = _repair_json(json_str)
        if repaired != json_str:
            try:
                data = json.loads(repaired)
                if isinstance(data, dict):
                    return data, ""
            except (json.JSONDecodeError, ValueError):
                pass

    # 第四次尝试：花括号不闭合 → 取到末尾 + 修复
    start_idx = text.find('{')
    if start_idx >= 0 and json_str is None:
        tail = text[start_idx:]
        repaired = _repair_json(tail)
        try:
            data = json.loads(repaired)
            if isinstance(data, dict):
                return data, ""
        except (json.JSONDecodeError, ValueError):
            pass

    return None, "No valid JSON found in response"


def _validate_single(data: dict) -> Optional[Dict[str, Any]]:
    """验证并标准化单个工具调用"""
    tool = data.get("tool", "")
    if not tool:
        return None

    call = SingleToolCall(
        mode="single",
        tool=tool,
        command=data.get("command", ""),
        params=data.get("params", {}),
    )
    if "id" in data:
        call.call_id = data["id"]
    if "run_in_background" in data:
        call.run_in_background = data["run_in_background"]
    return call.model_dump(exclude_none=True)


def _validate_parallel(data: dict) -> Optional[Dict[str, Any]]:
    """验证并标准化并行工具调用"""
    calls = data.get("calls", [])
    if not calls:
        return None

    parallel = ParallelToolCall(
        mode="parallel",
        calls=calls,
    )
    if "id" in data:
        parallel.call_id = data["id"]
    return parallel.model_dump(exclude_none=True)


def _classify_tool_call(data: dict) -> Tuple[Optional[Dict[str, Any]], str]:
    """按结构判断是否为工具调用（不依赖 type 字段）

    Returns:
        (parsed_dict_or_None, error_detail_str)
    """
    msg_type = data.get("type")

    # 模式1：带 type 字段的旧格式（向后兼容）
    if msg_type == "tool_call":
        result = _validate_single(data)
        return result, "" if result else "tool_call format: missing 'tool' or 'params' field"

    if msg_type == "tool_call_parallel":
        result = _validate_parallel(data)
        return result, "" if result else "tool_call_parallel format: missing or empty 'calls' array"

    # 模式2：calls 数组（无 type 字段）
    if "calls" in data and isinstance(data["calls"], list):
        result = _validate_parallel(data)
        return result, "" if result else "Parallel call: 'calls' array is empty"

    # 模式3：纯 {tool, params} 结构（无 type 字段）
    if "tool" in data:
        result = _validate_single(data)
        return result, "" if result else "Single call: 'tool' field is empty"

    return None, "JSON structure does not match any tool call format (missing 'tool' or 'calls' field)"


def parse_tool_call(text: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """从 AI 回复中解析工具调用

    Returns:
        (parsed_dict_or_None, error_detail_str)
        - 成功：(标准化dict, "")
        - 失败：(None, 具体错误描述)
    """
    data, json_error = extract_json(text)
    if not data:
        return None, json_error

    return _classify_tool_call(data)
