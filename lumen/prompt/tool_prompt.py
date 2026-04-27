"""
Lumen - 工具提示词生成
从工具注册表生成 <tools> 格式的提示词文本，注入到系统提示词中
"""

from typing import List, Dict


def get_tool_prompt_from_registry(tool_names: List[str] = None, tool_tips: Dict[str, str] = None) -> str:
    """从工具注册表生成工具提示词

    工具描述和使用指南用中文，格式规则用英文（模型遵循度更高）。
    支持两种格式：
    - commands 格式：一个工具下有多个命令
    - 简单格式：一个工具直接有 parameters（calculate、daily_note）

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
        commands = definition.get("commands", {})
        tip = (tool_tips or {}).get(name) or definition.get("usage_guide")

        if commands:
            # commands 格式：一个工具多个命令
            lines = [f"【{name}】{definition.get('description', '')}"]
            lines.append("Commands:")
            for cmd_name, cmd_def in commands.items():
                desc = cmd_def.get("description", "")
                lines.append(f"  {cmd_name} - {desc}")
                params = cmd_def.get("parameters", {}).get("properties", {})
                if params:
                    param_parts = []
                    for pname, pinfo in params.items():
                        param_parts.append(f'    "{pname}": {pinfo.get("description", pname)}')
                    lines.extend(param_parts)
            if tip:
                lines.append(f"使用时机: {tip}")
            tool_blocks.append("\n".join(lines))
        else:
            # 简单格式：直接有 parameters（calculate、daily_note）
            desc = definition.get("description", "")
            lines = [f"【{name}】{desc}"]
            params = definition.get("parameters", {}).get("properties", {})
            if params:
                lines.append("参数:")
                param_parts = []
                for pname, pinfo in params.items():
                    param_parts.append(f'  "{pname}": {pinfo.get("description", pname)}')
                lines.extend(param_parts)
            if tip:
                lines.append(f"使用时机: {tip}")
            tool_blocks.append("\n".join(lines))

    tools_text = "\n\n".join(tool_blocks)

    return f"""<tools>
你可以使用以下工具：

{tools_text}

How to call tools — output ONLY the JSON, no other text:

[Example: single command]
{{"tool": "file_manager", "command": "read", "params": {{"path": "/test.txt"}}}}

[Example: simple tool (no command)]
{{"tool": "calculate", "params": {{"expression": "100*0.85"}}}}

[Example: TWO or more tools at once — MUST use "calls" array]
{{"calls": [
  {{"tool": "web", "command": "search", "params": {{"query": "北京天气"}}}},
  {{"tool": "web", "command": "search", "params": {{"query": "上海天气"}}}}
]}}

Rules:
- When calling tools: output ONLY the JSON, nothing else
- When NOT calling tools: reply normally in text
- Tools with commands: MUST include "command" field
- Simple tools (no commands listed): just use "tool" and "params"
- For multiple independent calls: use the "calls" array format
- Use double quotes for all strings
- You can call multiple tools in a single response — make all independent calls in parallel
- If some tool calls depend on previous results, call them sequentially instead

Results come back in <tool_result> tags.

ReAct loop policy:
- After receiving tool results, evaluate: are they sufficient to answer the user?
- If YES → respond to the user in text
- If NO (empty, "not found", error, or insufficient) → make ANOTHER tool call with modified parameters or try a different tool/approach
- You may retry multiple times with different strategies before giving up
- Do NOT give the user a "not found" answer after a single failed attempt — investigate and try harder
- If an approach fails, diagnose why before switching tactics
- When uncertain about what to do, try the simplest approach first

Tool persistence:
- Use tools whenever they improve correctness, completeness, or grounding
- Do not stop early when another tool call would materially improve the result
- Keep calling tools until: (1) the task is complete, AND (2) you have verified the result
- You MUST use your tools to take action — do not describe what you would do without actually doing it

Tool result handling:
- Tool results are provided by the system in <tool_result> tags — they are NOT user messages
- When you receive tool results, decide your next action based on the content
- If a tool result contains an error, read the error message carefully and adjust your approach
- Important information from tool results should be incorporated into your final response
</tools>"""


def get_tool_prompt() -> str:
    """生成工具提示词（包含所有可用工具）"""
    return get_tool_prompt_from_registry(None)
