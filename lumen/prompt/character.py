"""
Lumen - 角色卡片管理
加载和管理 characters/ 目录下的角色定义文件
"""

import json
import os
import re
import logging

logger = logging.getLogger(__name__)

# 角色卡片文件夹（lumen/characters/）
CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "characters")


def _validate_char_id(char_id: str) -> str:
    """校验角色ID合法性，防止路径穿越"""
    if not re.match(r'^[a-zA-Z0-9_\-]+$', char_id):
        raise ValueError(f"非法的角色ID: {char_id}")
    return char_id


def list_characters():
    """列出所有可用角色，返回 [(文件名, 角色名), ...]"""
    characters = []
    if not os.path.exists(CHARACTERS_DIR):
        return characters

    for filename in os.listdir(CHARACTERS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(CHARACTERS_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    card = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("跳过损坏的角色文件 %s: %s", filename, e)
                continue
            char_id = filename[:-5]  # "default.json" → "default"
            characters.append((char_id, card.get("name", char_id)))
    return characters


def load_character(char_id: str) -> dict:
    """根据角色ID加载角色卡片

    char_id 就是文件名去掉 .json，比如 "default"
    返回整个JSON字典
    """
    _validate_char_id(char_id)
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"角色不存在: {char_id}")
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)
