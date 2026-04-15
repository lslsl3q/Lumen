"""
Lumen - 对话历史存储
用 SQLite 存储聊天记录，重启不丢失
以后记忆系统可以从这里搜索历史对话
"""

import sqlite3
import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# 数据库文件路径（lumen/data/）
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "history.db")

# 模块级单例连接，整个进程复用同一个
_conn: Optional[sqlite3.Connection] = None


def _get_conn():
    """获取数据库连接（单例复用，进程内只建立一个连接）"""
    global _conn
    if _conn is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
    return _conn


def close_conn():
    """关闭数据库连接（程序退出时调用）"""
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


def _migrate_add_metadata():
    """数据库迁移：给 messages 表添加 metadata 字段"""
    conn = _get_conn()
    cursor = conn.cursor()

    # 检查 metadata 字段是否存在
    cursor.execute("PRAGMA table_info(messages)")
    columns = [row["name"] for row in cursor.fetchall()]

    if "metadata" not in columns:
        logger.info("数据库迁移: 添加 metadata 字段到 messages 表...")
        cursor.execute("ALTER TABLE messages ADD COLUMN metadata TEXT")
        conn.commit()
        logger.info("数据库迁移: 完成")


def _init_db():
    """初始化数据库，创建表（只在第一次运行时执行）"""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT PRIMARY KEY,
            character_id TEXT,
            created_at   TEXT,
            updated_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT,
            role        TEXT,
            content     TEXT,
            metadata    TEXT,
            created_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS summaries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT,
            character_id TEXT,
            summary      TEXT,
            created_at   TEXT
        );
    """)

    # 数据库迁移：给现有表添加 metadata 字段
    _migrate_add_metadata()


# 程序启动时自动初始化数据库
_init_db()


def new_session(character_id: str = "default") -> str:
    """创建新会话，返回会话ID"""
    session_id = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    now = datetime.now().isoformat()
    conn = _get_conn()
    conn.execute(
        "INSERT INTO sessions (id, character_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (session_id, character_id, now, now),
    )
    conn.commit()
    return session_id


def save_message(session_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
    """保存一条消息到数据库

    Args:
        session_id: 会话 ID
        role: 消息角色（user/assistant/system）
        content: 消息内容
        metadata: 消息元数据（可选），会转换为 JSON 存储
    """
    now = datetime.now().isoformat()
    metadata_json = json.dumps(metadata, ensure_ascii=False) if metadata else None

    conn = _get_conn()
    conn.execute(
        "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
        (session_id, role, content, metadata_json, now),
    )
    # 更新会话的最后活跃时间
    conn.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?",
        (now, session_id),
    )
    conn.commit()


def load_session(session_id: str) -> List[Dict[str, Any]]:
    """加载某个会话的所有消息，返回 messages 列表

    Args:
        session_id: 会话 ID

    Returns:
        消息列表，格式：[{"role": ..., "content": ..., "metadata": ...}, ...]
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT role, content, metadata FROM messages WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()

    messages = []
    for row in rows:
        msg = {"role": row["role"], "content": row["content"]}
        # 解析 metadata（如果有）
        if row["metadata"]:
            try:
                msg["metadata"] = json.loads(row["metadata"])
            except json.JSONDecodeError:
                msg["metadata"] = {"type": "normal", "folded": False}
        else:
            msg["metadata"] = {"type": "normal", "folded": False}
        messages.append(msg)

    return messages


def list_sessions(limit: int = 20) -> list:
    """列出最近的会话，返回 [(会话ID, 角色名, 创建时间), ...]"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, character_id, created_at FROM sessions ORDER BY updated_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [(row["id"], row["character_id"], row["created_at"]) for row in rows]


def delete_session(session_id: str):
    """删除一个会话及其所有消息和摘要"""
    conn = _get_conn()
    conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM summaries WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()


def save_summary(session_id: str, character_id: str, summary: str):
    """保存会话摘要"""
    now = datetime.now().isoformat()
    conn = _get_conn()
    conn.execute(
        "INSERT INTO summaries (session_id, character_id, summary, created_at) VALUES (?, ?, ?, ?)",
        (session_id, character_id, summary, now),
    )
    conn.commit()


def load_summaries(character_id: str, limit: int = 3) -> list:
    """读取某角色最近的 N 条摘要
    返回 [(会话ID, 摘要文本), ...]
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT session_id, summary FROM summaries WHERE character_id = ? ORDER BY id DESC LIMIT ?",
        (character_id, limit),
    ).fetchall()
    return [(row["session_id"], row["summary"]) for row in rows]
