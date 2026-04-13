"""
Lumen - 提示词构建器
把角色卡片 + 动态内容拼成发给AI的提示词
"""

import json
import os

# 角色卡片文件夹
CHARACTERS_DIR = os.path.join(os.path.dirname(__file__), "characters")


def list_characters():
    """列出所有可用角色，返回 [(文件名, 角色名), ...]"""
    characters = []
    if not os.path.exists(CHARACTERS_DIR):
        return characters

    for filename in os.listdir(CHARACTERS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(CHARACTERS_DIR, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                card = json.load(f)
            # 文件名去掉.json是角色ID，card["name"]是显示名
            char_id = filename[:-5]  # "default.json" → "default"
            characters.append((char_id, card.get("name", char_id)))
    return characters


def load_character(char_id: str) -> dict:
    """根据角色ID加载角色卡片

    char_id 就是文件名去掉 .json，比如 "default"
    返回整个JSON字典
    """
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


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
        from tools import get_tool_prompt_from_registry
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
