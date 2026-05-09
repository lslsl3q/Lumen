"""Design Token 主题系统 — SQLite 存储层

纯同步层 — API 路由通过 asyncio.to_thread() 调用。
"""

import sqlite3
import os
import json
import logging
import threading
from typing import Optional

from lumen.config import THEME_DB

logger = logging.getLogger(__name__)

DB_PATH = THEME_DB

_local = threading.local()
_write_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _init_tables(_local.conn)
    return _local.conn


def close_conn():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None


def _init_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS themes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            tokens TEXT NOT NULL DEFAULT '{}',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS theme_overrides (
            theme_id TEXT NOT NULL,
            token_name TEXT NOT NULL,
            token_value TEXT NOT NULL,
            PRIMARY KEY (theme_id, token_name),
            FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_themes_builtin
            ON themes(is_builtin);
    """)
    conn.commit()


# ── Theme CRUD ──

def list_themes() -> list[dict]:
    """列出所有主题"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, name, is_builtin, description, created_at FROM themes ORDER BY is_builtin DESC, name ASC"
    ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "is_builtin": bool(row["is_builtin"]),
            "description": row["description"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def get_theme(theme_id: str) -> Optional[dict]:
    """获取单个主题详情，不存在返回 None"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM themes WHERE id = ?", (theme_id,)
    ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "tokens": json.loads(row["tokens"]),
        "is_builtin": bool(row["is_builtin"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_theme(
    theme_id: str,
    name: str,
    tokens: dict,
    description: str = "",
    is_builtin: bool = False,
) -> dict:
    """创建新主题，返回完整信息"""
    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO themes (id, name, description, tokens, is_builtin) VALUES (?, ?, ?, ?, ?)",
            (theme_id, name, description, json.dumps(tokens, ensure_ascii=False), int(is_builtin)),
        )
        conn.commit()
    return get_theme(theme_id)


def delete_theme(theme_id: str) -> bool:
    """删除主题（仅非内置），返回是否成功"""
    conn = _get_conn()
    row = conn.execute("SELECT is_builtin FROM themes WHERE id = ?", (theme_id,)).fetchone()
    if not row:
        return False
    if row["is_builtin"]:
        return False  # 内置主题不可删除

    with _write_lock:
        conn = _get_conn()
        cursor = conn.execute("DELETE FROM themes WHERE id = ?", (theme_id,))
        conn.commit()
        return cursor.rowcount > 0


# ── Token Overrides ──

def get_overrides(theme_id: str) -> dict[str, str]:
    """获取主题的 token 覆盖值"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT token_name, token_value FROM theme_overrides WHERE theme_id = ?",
        (theme_id,),
    ).fetchall()
    return {row["token_name"]: row["token_value"] for row in rows}


def save_overrides(theme_id: str, overrides: dict[str, str]):
    """保存 token 覆盖值（upsert）"""
    with _write_lock:
        conn = _get_conn()
        for token_name, token_value in overrides.items():
            conn.execute(
                "INSERT OR REPLACE INTO theme_overrides (theme_id, token_name, token_value) VALUES (?, ?, ?)",
                (theme_id, token_name, token_value),
            )
        conn.commit()


def clear_overrides(theme_id: str):
    """清空主题的所有覆盖值"""
    with _write_lock:
        conn = _get_conn()
        conn.execute("DELETE FROM theme_overrides WHERE theme_id = ?", (theme_id,))
        conn.commit()


# ── App Settings ──

def get_setting(key: str, default: str = "") -> str:
    """获取应用设置"""
    conn = _get_conn()
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str):
    """设置应用值"""
    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
            (key, value),
        )
        conn.commit()


# ── Current Theme ──

def get_current_theme_id() -> str:
    """获取当前主题 ID，默认返回 lumen-dark"""
    return get_setting("current_theme_id", "lumen-dark")


def set_current_theme_id(theme_id: str):
    """设置当前主题 ID"""
    set_setting("current_theme_id", theme_id)
