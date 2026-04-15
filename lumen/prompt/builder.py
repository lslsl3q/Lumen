"""
Lumen - 提示词构建器
把角色卡片 + 动态内容拼成发给AI的提示词
"""


def build_system_prompt(character: dict, dynamic_context: list = None) -> str:
    """把角色卡片 + 动态内容拼成系统提示词

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
    tools = character.get("tools", [])
    if tools:
        from lumen.tools.base import get_tool_prompt_from_registry
        tool_prompt = get_tool_prompt_from_registry(tools)
        if tool_prompt:
            parts.append(tool_prompt)

    # 第三层：动态注入（只拼 injection_point == "system" 的）
    if dynamic_context:
        for item in dynamic_context:
            if item.get("injection_point", "system") == "system":
                parts.append(item["content"])

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
