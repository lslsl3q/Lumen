"""
Lumen - 工具提示词生成
从工具注册表生成 <tools> 格式的提示词文本，注入到系统提示词中
"""

from typing import List, Dict


def get_tool_prompt_from_registry(tool_names: List[str] = None, tool_tips: Dict[str, str] = None) -> str:
    """从工具注册表生成工具提示词

    工具描述和使用指南用中文（服务角色场景），格式规则用英文（模型遵循度更高）。
    每个工具的描述、参数、使用指南绑定在一起输出，避免注意力衰减。

    tool_tips: 角色自定义的工具提示 {tool_name: custom_tip}
              优先使用自定义提示，fallback 到 registry 的 usage_guide
    """
    from lumen.tools.registry import get_registry

    registry = get_registry()
    tools_def = registry.get_tools(tool_names)

    if not tools_def:
        return ""

    tool_blocks = []
    for name, definition in tools_def.items():
        # 工具描述
        desc = definition.get("description", "")
        lines = [f"【{name}】{desc}"]

        # 参数
        params = definition.get("parameters", {}).get("properties", {})
        if params:
            param_parts = []
            for param_name, param_info in params.items():
                param_parts.append(f'  "{param_name}": {param_info.get("description", param_name)}')
            lines.append("参数:")
            lines.extend(param_parts)

        # 使用指南（自定义 tips 优先，fallback 到 registry 的 usage_guide）
        tip = (tool_tips or {}).get(name) or definition.get("usage_guide")
        if tip:
            lines.append(f"使用时机: {tip}")

        tool_blocks.append("\n".join(lines))

    tools_text = "\n\n".join(tool_blocks)

    return f"""<tools>
你可以使用以下工具：

{tools_text}

How to call tools — output ONLY the JSON, no other text:

[Example: single search]
{{"tool": "web_search", "params": {{"query": "天气"}}}}

[Example: calculate]
{{"tool": "calculate", "params": {{"expression": "100*0.85"}}}}

[Example: TWO or more tools at once — MUST use "calls" array]
{{"calls": [
  {{"tool": "web_search", "params": {{"query": "北京天气"}}}},
  {{"tool": "web_search", "params": {{"query": "上海天气"}}}}
]}}

Rules:
- When calling tools: output ONLY the JSON, nothing else
- When NOT calling tools: reply normally in text
- For multiple independent calls: use the "calls" array format (NOT two separate JSONs)
- Use double quotes for all strings

Results come back in <tool_result> tags. Respond based on results.
</tools>"""


def get_tool_prompt() -> str:
    """生成工具提示词（包含所有可用工具）"""
    return get_tool_prompt_from_registry(None)
