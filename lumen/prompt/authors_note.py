"""
Lumen - Author's Note 数据管理
CRUD + 内存缓存 + 注入消息生成
"""

import json
import logging
from typing import Optional

from lumen.services import history
from lumen.types.authors_note import AuthorsNoteConfig

logger = logging.getLogger(__name__)

# 模块级缓存：{session_id: AuthorsNoteConfig | None}
_cache: dict[str, Optional[AuthorsNoteConfig]] = {}


def get_authors_note_config(session_id: str) -> Optional[AuthorsNoteConfig]:
    """获取会话的 Author's Note 配置（带缓存）"""
    if session_id in _cache:
        return _cache[session_id]

    data = history.get_authors_note(session_id)
    if data:
        config = AuthorsNoteConfig(**data)
    else:
        config = None

    _cache[session_id] = config
    return config


def save_authors_note_config(session_id: str, config: AuthorsNoteConfig):
    """保存 Author's Note 配置到数据库 + 更新缓存"""
    history.save_authors_note(session_id, config.model_dump_json())
    _cache[session_id] = config


def delete_authors_note_config(session_id: str):
    """删除 Author's Note（数据库置 NULL + 清缓存）"""
    history.save_authors_note(session_id, None)
    _cache[session_id] = None


def clear_cache(session_id: Optional[str] = None):
    """清缓存（切换会话/删除会话时用）"""
    if session_id:
        _cache.pop(session_id, None)
    else:
        _cache.clear()


def get_injection_messages(session_id: str) -> list[dict]:
    """返回要注入的消息列表（供 chat.py 使用）

    Returns:
        空列表 = 不注入，否则返回 [system 消息] 供插入到消息流中
    """
    config = get_authors_note_config(session_id)
    if not config or not config.enabled or not config.content.strip():
        return []

    return [{"role": "system", "content": config.content}]
