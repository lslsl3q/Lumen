"""Design Token 主题系统 — 业务逻辑层

- 内置主题自动导入（从 lumen-Front/src/lib/theme/themes/*.json）
- 主题切换 + token 微调
- 保存为新主题
"""

import os
import json
import logging

from lumen.types.theme import validate_tokens, TokenError
from lumen.services.storage import theme as theme_storage

logger = logging.getLogger(__name__)

# 内置主题 JSON 文件目录（从 services/ 回到项目根，再进入 lumen-Front）
_THEME_JSON_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "lumen-Front",
    "src",
    "lib",
    "theme",
    "themes",
)

# 内置主题 ID 映射（JSON 文件名 → 主题 ID）
_BUILTIN_THEMES = {
    "lumen-dark.json": "lumen-dark",
    "lumen-light.json": "lumen-light",
}


def ensure_builtin_themes():
    """确保内置主题已导入数据库（不存在则创建）"""
    existing_ids = {t["id"] for t in theme_storage.list_themes()}

    for json_file, theme_id in _BUILTIN_THEMES.items():
        if theme_id in existing_ids:
            continue

        json_path = os.path.join(_THEME_JSON_DIR, json_file)
        if not os.path.exists(json_path):
            logger.warning(f"内置主题文件不存在: {json_path}")
            continue

        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            theme_storage.create_theme(
                theme_id=theme_id,
                name=data.get("name", theme_id),
                tokens=data.get("tokens", {}),
                description=data.get("description", "内置主题"),
                is_builtin=True,
            )
            logger.info(f"导入内置主题: {theme_id}")
        except Exception as e:
            logger.error(f"导入内置主题失败 {json_file}: {e}")


def get_full_theme(theme_id: str) -> dict:
    """获取主题的完整 token 值（基础 tokens + overrides 合并）及覆盖层"""
    theme = theme_storage.get_theme(theme_id)
    if not theme:
        return {}

    base_tokens = theme.get("tokens", {})
    overrides = theme_storage.get_overrides(theme_id)

    return {
        "tokens": {**base_tokens, **overrides},
        "overrides": overrides,
    }


def apply_theme_switch(theme_id: str) -> dict:
    """切换主题：清空当前 overrides，切换到新主题，返回完整主题"""
    # 验证主题存在
    theme = theme_storage.get_theme(theme_id)
    if not theme:
        raise ValueError(f"主题不存在: {theme_id}")

    # 切换
    theme_storage.set_current_theme_id(theme_id)
    theme_storage.clear_overrides(theme_id)

    return get_full_theme(theme_id)  # 返回 {"tokens": merged, "overrides": {}}


def apply_token_overrides(tokens: dict[str, str]) -> dict:
    """应用 token 微调：验证后保存到当前主题的 overrides

    Returns:
        {
            "applied": dict[str, str],  # 成功应用的 token
            "errors": list[TokenError],  # 验证失败的 token
        }
    """
    valid, errors = validate_tokens(tokens)

    if valid:
        current_theme_id = theme_storage.get_current_theme_id()
        theme_storage.save_overrides(current_theme_id, valid)

    return {"applied": valid, "errors": errors}


def save_as_new_theme(name: str, description: str = "") -> dict:
    """保存当前主题（基础 + overrides）为新主题

    新主题 ID 自动生成：user-{timestamp}
    """
    current_theme_id = theme_storage.get_current_theme_id()
    base_theme = theme_storage.get_theme(current_theme_id)
    if not base_theme:
        raise ValueError(f"当前主题不存在: {current_theme_id}")

    # 合并基础 tokens + overrides
    overrides = theme_storage.get_overrides(current_theme_id)
    merged_tokens = {**base_theme.get("tokens", {}), **overrides}

    # 生成新 ID
    import time
    new_theme_id = f"user-{int(time.time())}"

    # 创建新主题
    theme_storage.create_theme(
        theme_id=new_theme_id,
        name=name,
        tokens=merged_tokens,
        description=description,
        is_builtin=False,
    )

    # 切换到新主题
    theme_storage.set_current_theme_id(new_theme_id)

    return theme_storage.get_theme(new_theme_id)
