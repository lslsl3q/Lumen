"""
Lumen - 角色卡片读取
加载 characters/ 目录下的角色定义文件，服务于提示词构建流程

写操作（create/update/delete/save_avatar）在 services/character.py
"""

import json
import os
import re
import logging

from lumen.prompt.types import CharacterCard

logger = logging.getLogger(__name__)

CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "characters")


def _validate_char_id(char_id: str) -> str:
    """校验角色ID合法性，防止路径穿越"""
    if not re.match(r'^[a-zA-Z0-9_\-]+$', char_id):
        raise ValueError(f"非法的角色ID: {char_id}")
    return char_id


def list_characters() -> list[dict]:
    """列出所有可用角色，返回 [{"id": ..., "name": ...}, ...]"""
    characters = []
    if not os.path.exists(CHARACTERS_DIR):
        return characters

    for filename in os.listdir(CHARACTERS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(CHARACTERS_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                card = CharacterCard.model_validate(raw)
            except Exception as e:
                logger.warning("跳过损坏的角色文件 %s: %s", filename, e)
                continue
            char_id = filename[:-5]
            characters.append({"id": char_id, "name": card.name})
    return characters


def load_character(char_id: str) -> dict:
    """加载角色卡片，用 CharacterCard Pydantic 校验后返回 dict

    返回 dict（而非 Pydantic 模型）以保持向后兼容
    """
    _validate_char_id(char_id)
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"角色不存在: {char_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    card = CharacterCard.model_validate(raw)
    return card.model_dump(exclude_none=True)
