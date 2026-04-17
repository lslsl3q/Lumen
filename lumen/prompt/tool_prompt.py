"""
Lumen - 工具提示词生成
从工具注册表生成 <tools> 格式的提示词文本，注入到系统提示词中
"""

from typing import List, Dict


def get_tool_prompt_from_registry(tool_names: List[str] = None, tool_tips: Dict[str, str] = None) -> str:
    """从工具注册表生成工具提示词

    每个工具的描述、参数、使用指南绑定在一起输出，
    避免工具多时描述和使用规则距离过远导致注意力衰减。

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
你可以使用以下工具来帮助用户：

{tools_text}

调用格式：

【单个工具调用】：
{{"type": "tool_call", "tool": "工具名", "params": {{"参数名": "参数值"}}}}

【多个工具并行】（多个工具互不依赖时）：
{{"type": "tool_call_parallel", "calls": [
  {{"tool": "工具名1", "params": {{...}}}},
  {{"tool": "工具名2", "params": {{...}}}}
]}}

规则：
- 只有确实需要使用工具时才输出JSON，普通对话正常回复文字
- 不要在JSON前后加任何解释文字
- 如果多个工具有依赖关系，请分步调用单个工具
- type 字段必须包含，否则工具调用会被忽略
</tools>"""


def get_tool_prompt() -> str:
    """生成工具提示词（包含所有可用工具）"""
    return get_tool_prompt_from_registry(None)
