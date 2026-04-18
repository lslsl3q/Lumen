"""
Lumen - 角色文件 CRUD 服务
角色卡片的写操作：创建、更新、删除、头像管理

读操作（load_character、list_characters）留在 prompt/character.py，
因为它们服务于提示词构建流程。
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


def create_character(char_id: str, data: dict) -> dict:
    """创建新角色

    char_id: 角色ID（用于文件名）
    data: 角色数据（至少包含 name）

    返回创建后的角色 dict
    """
    _validate_char_id(char_id)
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    if os.path.exists(filepath):
        raise FileExistsError(f"角色已存在: {char_id}")

    card = CharacterCard.model_validate(data)
    raw = card.model_dump(exclude_none=True)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    logger.info("创建角色: %s", char_id)
    return raw


def update_character(char_id: str, updates: dict) -> dict:
    """更新已有角色（合并字段，不覆盖未提交的字段）

    char_id: 角色ID
    updates: 要更新的字段

    返回更新后的角色 dict
    """
    _validate_char_id(char_id)
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"角色不存在: {char_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        existing = json.load(f)

    existing.update(updates)

    card = CharacterCard.model_validate(existing)
    raw = card.model_dump(exclude_none=True)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    logger.info("更新角色: %s", char_id)
    return raw


def delete_character(char_id: str) -> None:
    """删除角色

    禁止删除 default 角色
    同时清理对应的头像文件
    """
    if char_id == "default":
        raise ValueError("不能删除默认角色")

    _validate_char_id(char_id)
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"角色不存在: {char_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    avatar = data.get("avatar")
    if avatar:
        avatar_path = os.path.join(CHARACTERS_DIR, "avatars", avatar)
        if os.path.exists(avatar_path):
            os.remove(avatar_path)
            logger.info("删除头像: %s", avatar)

    os.remove(filepath)
    logger.info("删除角色: %s", char_id)


def save_avatar(char_id: str, filename: str, file_data: bytes) -> str:
    """保存头像文件

    char_id: 角色ID
    filename: 原始文件名（用于提取扩展名）
    file_data: 图片二进制数据

    返回保存的文件名
    """
    _validate_char_id(char_id)

    avatars_dir = os.path.join(CHARACTERS_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)

    ext = os.path.splitext(filename)[1] or ".png"
    avatar_filename = f"{char_id}{ext}"
    avatar_path = os.path.join(avatars_dir, avatar_filename)

    if os.path.exists(avatar_path):
        os.remove(avatar_path)

    with open(avatar_path, "wb") as f:
        f.write(file_data)

    logger.info("保存头像: %s -> %s", char_id, avatar_filename)
    return avatar_filename
