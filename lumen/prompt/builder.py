"""
Lumen - 提示词构建器
把角色卡片 + 动态内容拼成发给AI的提示词
"""


def build_system_prompt(character: dict, dynamic_context: list = None) -> str:
    """把角色卡片 + 动态内容拼成系统提示词（三明治结构）

    结构（从上到下）：
    1. 角色设定（来自 character.system_prompt）
    2. 工具说明（来自 registry.json，按角色 tools 字段过滤）
    3. 动态内容（记忆、上下文等）
    4. 角色保持指令（防止工具调用后掉角色）

    character: load_character() 返回的角色卡片
    dynamic_context: 动态内容列表，每项是一个字典：
        {
            "content": "内容文本",
            "injection_point": "system" | "before_user" | "after_user"
        }
    """
    # 第一层：角色卡片的 system_prompt
    parts = [character.get("system_prompt", "")]

    # 第二层：工具注入（从角色配置读取 tools 字段）
    has_tools = False
    tools = character.get("tools", [])
    if tools:
        from lumen.tools.base import get_tool_prompt_from_registry
        tool_prompt = get_tool_prompt_from_registry(tools)
        if tool_prompt:
            parts.append(tool_prompt)
            has_tools = True

    # 第三层：动态注入（只拼 injection_point == "system" 的）
    if dynamic_context:
        for item in dynamic_context:
            if item.get("injection_point", "system") == "system":
                parts.append(item["content"])

    # 第四层（兜底）：强制角色保持——放在最后，权重最高
    if has_tools and character.get("system_prompt"):
        parts.append(
            "【角色保持】\n"
            "无论你是在闲聊还是刚执行完工具调用，你对用户说的每一句话都必须符合你的角色设定。"
            "工具调用的 JSON 格式必须严格正确（不受角色影响），"
            "但最终呈现给用户的文字必须带有你独特的语气和性格。"
        )

    return "\n\n".join(parts)


def build_messages(character: dict, user_input: str, history: list, dynamic_context: list = None):
    """组装完整的消息列表，处理动态注入的不同位置

    返回可以直接发给AI的 messages 列表
    """
    messages = []

    # 系统提示词
    system_prompt = build_system_prompt(character, dynamic_context)
    messages.append({"role": "system", "content": system_prompt})

    # 聊天历史
    for msg in history:
        messages.append(msg)

    # 动态注入：user消息之前
    if dynamic_context:
        for item in dynamic_context:
            if item.get("injection_point") == "before_user":
                messages.append({"role": "system", "content": item["content"]})

    # 用户消息
    messages.append({"role": "user", "content": user_input})

    # 动态注入：user消息之后
    if dynamic_context:
        for item in dynamic_context:
            if item.get("injection_point") == "after_user":
                messages.append({"role": "system", "content": item["content"]})

    return messages
