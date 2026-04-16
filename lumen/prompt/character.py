"""
Lumen - 角色卡片管理
加载和管理 characters/ 目录下的角色定义文件
"""

import json
import os
import re
import logging

from lumen.prompt.types import CharacterCard

logger = logging.getLogger(__name__)

# 角色卡片文件夹（lumen/characters/）
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

    # Pydantic 校验：缺少必填字段或类型错误会抛出 ValidationError
    card = CharacterCard.model_validate(raw)
    return card.model_dump(exclude_none=True)


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

    # Pydantic 校验
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

    # 读取现有数据
    with open(filepath, "r", encoding="utf-8") as f:
        existing = json.load(f)

    # 合并更新
    existing.update(updates)

    # Pydantic 校验合并后的结果
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

    # 读取角色数据以获取头像文件名
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 删除头像文件
    avatar = data.get("avatar")
    if avatar:
        avatar_path = os.path.join(CHARACTERS_DIR, "avatars", avatar)
        if os.path.exists(avatar_path):
            os.remove(avatar_path)
            logger.info("删除头像: %s", avatar)

    # 删除角色 JSON 文件
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

    # 用角色ID + 扩展名命名
    ext = os.path.splitext(filename)[1] or ".png"
    avatar_filename = f"{char_id}{ext}"
    avatar_path = os.path.join(avatars_dir, avatar_filename)

    # 如果旧头像存在且文件名不同，先删除
    if os.path.exists(avatar_path):
        os.remove(avatar_path)

    with open(avatar_path, "wb") as f:
        f.write(file_data)

    logger.info("保存头像: %s -> %s", char_id, avatar_filename)
    return avatar_filename
