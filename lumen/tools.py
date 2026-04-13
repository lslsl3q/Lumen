"""
Lumen - 工具系统
用 JSON Schema 定义工具，AI 通过输出 JSON 来调用
"""

import json
import re
from datetime import datetime
from typing import List, Dict, Optional


# ========================================
# 工具定义（JSON Schema 格式）
# ========================================

TOOL_DEFINITIONS = [
    {
        "name": "get_current_time",
        "description": "获取当前的日期、时间和星期",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "calculate",
        "description": "计算数学表达式的结果，支持加减乘除、幂运算、括号",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "数学表达式，例如 2+3*4 或 (100-20)/8"
                }
            },
            "required": ["expression"]
        }
    }
]


# ========================================
# 生成工具提示词（注入到 system prompt）
# ========================================

def get_tool_prompt():
    """生成工具说明，拼到 system prompt 里告诉 AI 有哪些工具可用"""

    # 拼工具列表
    tool_lines = []
    for tool in TOOL_DEFINITIONS:
        # 如果有参数，列出参数说明
        params = tool["parameters"].get("properties", {})
        if params:
            param_parts = []
            for name, info in params.items():
                param_parts.append(f'"{name}": {info.get("description", name)}')
            params_text = "，参数: {" + ", ".join(param_parts) + "}"
        else:
            params_text = ""

        tool_lines.append(f'- {tool["name"]}: {tool["description"]}{params_text}')

    tools_text = "\n".join(tool_lines)

    return f"""<tools>
你可以使用以下工具来帮助用户：
{tools_text}

在使用工具前，请先思考：
1. 用户的问题是否需要使用工具？
2. 如果需要，应该使用哪个工具？
3. 工具的参数是否齐全？如果参数不齐全，请先询问用户。

当你需要使用工具时，请只输出以下JSON格式，不要输出任何其他文字：
{{"tool": "工具名", "params": {{"参数名": "参数值"}}}}

规则：
- 只有确实需要使用工具时才输出JSON，普通对话正常回复文字
- 一次只能调用一个工具
- 不要在JSON前后加任何解释文字
</tools>"""


# ========================================
# 工具执行
# ========================================

def execute_tool(name: str, params: dict) -> str:
    """执行工具调用，返回结果文本"""

    if name == "get_current_time":
        now = datetime.now()
        weekdays = ["一", "二", "三", "四", "五", "六", "日"]
        return f"当前时间：{now.strftime('%Y年%m月%d日 %H:%M:%S')}，星期{weekdays[now.weekday()]}"

    elif name == "calculate":
        expression = params.get("expression", "")
        if not expression:
            return "错误：没有提供数学表达式"
        try:
            # 安全检查：只允许数字和基本运算符
            allowed = set("0123456789+-*/.() ")
            if not all(c in allowed for c in expression):
                return "错误：表达式包含不允许的字符（只支持数字和 +-*/.()）"
            # 安全计算（只允许基本运算，不能用 eval 执行任意代码）
            result = eval(expression, {"__builtins__": {}}, {})
            return f"{expression} = {result}"
        except Exception as e:
            return f"计算错误：{e}"

    else:
        return f"未知工具：{name}"


# ========================================
# 解析 AI 输出
# ========================================

def parse_tool_call(text: str):
    """尝试从 AI 回复中解析工具调用

    返回 {"tool": "xxx", "params": {...}} 或 None
    """
    text = text.strip()

    # 方法1：整个回复就是 JSON
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "tool" in data:
            return data
    except (json.JSONDecodeError, ValueError):
        pass

    # 方法2：回复里包含一个 JSON 块（AI 可能在 JSON 前后加了文字）
    # 改进版：找到第一个 {，然后逐个字符匹配找到对应的 }
    start_idx = text.find('{')
    if start_idx >= 0:
        brace_count = 0
        in_string = False
        escape = False
        for i in range(start_idx, len(text)):
            char = text[i]

            # 处理字符串内的转义字符
            if escape:
                escape = False
                continue
            if char == '\\':
                escape = True
                continue

            # 处理字符串边界
            if char == '"':
                in_string = not in_string
                continue

            # 只有在字符串外才计数花括号
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        # 找到了匹配的右花括号
                        json_str = text[start_idx:i+1]
                        try:
                            data = json.loads(json_str)
                            if isinstance(data, dict) and "tool" in data:
                                return data
                        except (json.JSONDecodeError, ValueError):
                            pass
                        break

    return None


# ========================================
# 从注册表生成工具提示词（新方法）
# ========================================

def get_tool_prompt_from_registry(tool_names: List[str] = None) -> str:
    """
    从工具注册表生成工具提示词

    Args:
        tool_names: 工具名称列表，如果为 None 则包含所有工具

    Returns:
        工具提示词字符串
    """
    from tool_lib.registry import get_registry

    registry = get_registry()
    tools_def = registry.get_tools(tool_names)

    if not tools_def:
        return ""

    # 拼工具列表
    tool_lines = []
    for name, definition in tools_def.items():
        # 如果有参数，列出参数说明
        params = definition.get("parameters", {}).get("properties", {})
        if params:
            param_parts = []
            for param_name, param_info in params.items():
                param_parts.append(f'"{param_name}": {param_info.get("description", param_name)}')
            params_text = "，参数: {" + ", ".join(param_parts) + "}"
        else:
            params_text = ""

        tool_lines.append(f'- {name}: {definition["description"]}{params_text}')

    tools_text = "\n".join(tool_lines)

    return f"""<tools>
你可以使用以下工具来帮助用户：
{tools_text}

在使用工具前，请先思考：
1. 用户的问题是否需要使用工具？
2. 如果需要，应该使用哪个工具？
3. 工具的参数是否齐全？如果参数不齐全，请先询问用户。

当你需要使用工具时，请只输出以下JSON格式，不要输出任何其他文字：
{{"tool": "工具名", "params": {{"参数名": "参数值"}}}}

规则：
- 只有确实需要使用工具时才输出JSON，普通对话正常回复文字
- 一次只能调用一个工具
- 不要在JSON前后加任何解释文字
</tools>"""


# ========================================
# 向后兼容
# ========================================

def get_tool_prompt() -> str:
    """生成工具说明（向后兼容，使用所有工具）"""
    return get_tool_prompt_from_registry(None)
