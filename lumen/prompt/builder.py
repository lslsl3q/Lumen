"""
Lumen - 提示词构建器
把角色卡片 + 动态内容拼成发给AI的提示词
"""

from lumen.prompt.types import DynamicContext


def _build_parts(character: dict, dynamic_context: list[DynamicContext] = None) -> list[tuple[str, str]]:
    """构建提示词各层，返回 [(层名称, 内容), ...]"""
    layers = []

    # 第一层：角色元数据
    parts = []
    if character.get("name"):
        parts.append(f"你的名字是{character['name']}。")
    if character.get("description"):
        parts.append(f"角色设定：{character['description']}。")
    if parts:
        layers.append(("角色元数据", "\n".join(parts)))

    # 第二层：角色核心 system_prompt
    if character.get("system_prompt"):
        layers.append(("角色核心", character["system_prompt"]))

    # 第 2.5 层：Persona
    try:
        from lumen.prompt.persona import get_active_persona_text
        persona_text = get_active_persona_text()
        if persona_text:
            layers.append(("Persona", persona_text))
    except Exception:
        pass

    # 第 2.6 层：Skills
    if character.get("skills"):
        try:
            from lumen.prompt.skill_store import get_skills_content
            skills_text = get_skills_content(character["skills"])
            if skills_text:
                layers.append(("Skills", skills_text))
        except Exception:
            pass

    # 第三层：工具说明
    tools = character.get("tools", [])
    if tools:
        from lumen.prompt.tool_prompt import get_tool_prompt_from_registry
        tool_prompt = get_tool_prompt_from_registry(tools, character.get("tool_tips"))
        if tool_prompt:
            layers.append(("工具说明", tool_prompt))

    # 第四层：动态注入
    if dynamic_context:
        system_items = sorted(
            [item for item in dynamic_context if item.get("injection_point", "system") == "system"],
            key=lambda x: (x.get("order", 0), x.get("depth", 4))
        )
        for item in system_items:
            layers.append(("动态注入", item["content"]))

    # 第五层：角色保持
    has_tools = bool(tools)
    if has_tools and character.get("system_prompt"):
        layers.append(("角色保持指令",
            "【角色保持】\n"
            "无论你是在闲聊还是刚执行完工具调用，你对用户说的每一句话都必须符合你的角色设定。"
            "工具调用的 JSON 格式必须严格正确（不受角色影响），"
            "但最终呈现给用户的文字必须带有你独特的语气和性格。"
        ))

    return layers


def build_system_prompt(character: dict, dynamic_context: list[DynamicContext] = None) -> str:
    """把角色卡片 + 动态内容拼成系统提示词（三明治结构）"""
    layers = _build_parts(character, dynamic_context)
    return "\n\n".join(content for _, content in layers)


def build_system_prompt_with_layers(character: dict, dynamic_context: list[DynamicContext] = None) -> tuple[str, list[dict]]:
    """构建系统提示词，同时返回分层信息（用于记忆调试 /tokens）

    Returns:
        (提示词文本, [{"name": 层名, "content": 内容, "tokens": 估算数}, ...])
    """
    layers = _build_parts(character, dynamic_context)
    from lumen.services.context.token_estimator import estimate_text_tokens

    layer_infos = []
    for name, content in layers:
        layer_infos.append({
            "name": name,
            "content": content,
            "tokens": estimate_text_tokens(content),
        })

    prompt_text = "\n\n".join(content for _, content in layers)
    return prompt_text, layer_infos


def build_messages(character: dict, user_input: str, history: list, dynamic_context: list[DynamicContext] = None):
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

    # 动态注入：user消息之前（按 depth 和 order 排序）
    if dynamic_context:
        before_user_items = sorted(
            [item for item in dynamic_context if item.get("injection_point") == "before_user"],
            key=lambda x: (x.get("order", 0), x.get("depth", 4))
        )
        for item in before_user_items:
            messages.append({"role": "system", "content": item["content"]})

    # 用户消息
    messages.append({"role": "user", "content": user_input})

    # 动态注入：user消息之后（按 depth 和 order 排序）
    if dynamic_context:
        after_user_items = sorted(
            [item for item in dynamic_context if item.get("injection_point") == "after_user"],
            key=lambda x: (x.get("order", 0), x.get("depth", 4))
        )
        for item in after_user_items:
            messages.append({"role": "system", "content": item["content"]})

    return messages
