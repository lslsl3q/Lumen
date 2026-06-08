"""
图谱边元数据的 SQLite 存储

TriviumDB 边无 payload，用此表存溯源信息。
独立 DB 文件，不再依赖 history.py。
"""

import logging
import os
import sqlite3
import threading
from datetime import datetime
from typing import Any, Optional

from lumen.config import GRAPH_META_DB

logger = logging.getLogger(__name__)

DB_PATH = GRAPH_META_DB
_local = threading.local()
write_lock = threading.Lock()

def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
    return _local.conn

def close_conn():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None

def _ensure_table():
    """初始化 graph_edge_meta 表（幂等）"""
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS graph_edge_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tdb TEXT NOT NULL DEFAULT 'knowledge',
            src_id INTEGER NOT NULL,
            dst_id INTEGER NOT NULL,
            label TEXT NOT NULL DEFAULT 'related',
            source_episode_id TEXT DEFAULT '',
            owner_id TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(tdb, src_id, dst_id, label)
        );
    """)
    conn.commit()

def save_edge_meta(tdb: str, src_id: int, dst_id: int, label: str,
                   source_episode_id: str = "", owner_id: str = "") -> None:
    """保存边元数据（INSERT OR IGNORE，重复插入不报错）"""
    now = datetime.now().isoformat()
    with write_lock:
        conn = get_conn()
        conn.execute(
            """INSERT OR IGNORE INTO graph_edge_meta
               (tdb, src_id, dst_id, label, source_episode_id, owner_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (tdb, src_id, dst_id, label, source_episode_id, owner_id, now),
        )
        conn.commit()

def get_edge_meta(tdb: str, src_id: int, dst_id: int) -> dict[str, Any] | None:
    """获取单条边元数据"""
    conn = get_conn()
    row = conn.execute(
        """SELECT * FROM graph_edge_meta
           WHERE tdb = ? AND src_id = ? AND dst_id = ?""",
        (tdb, src_id, dst_id),
    ).fetchone()
    if row:
        return dict(row)
    return None

def get_edges_by_owner(owner_id: str, tdb: str = "knowledge") -> list[dict[str, Any]]:
    """获取某个 owner 的所有边元数据"""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM graph_edge_meta WHERE owner_id = ? AND tdb = ?",
        (owner_id, tdb),
    ).fetchall()
    return [dict(r) for r in rows]

def delete_edge_meta(tdb: str, src_id: int, dst_id: int) -> bool:
    """删除单条边元数据，返回是否成功"""
    with write_lock:
        conn = get_conn()
        cursor = conn.execute(
            "DELETE FROM graph_edge_meta WHERE tdb = ? AND src_id = ? AND dst_id = ?",
            (tdb, src_id, dst_id),
        )
        conn.commit()
        return cursor.rowcount > 0

_ensure_table()
