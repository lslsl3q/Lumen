"""
T11 写作模式服务层 — 作品/章节/世界观设定 CRUD

每本书 = 一个 channel（type="writing"），章节内容存 SQLite，
世界观设定通过 TriviumDB writing.tdb 管理（图谱节点+边）。
Agent 通过 LoreComponent 查询 writings.tdb 感知剧情线。

纯同步层 — API 路由通过 asyncio.to_thread() 调用。
"""

import sqlite3
import os
import json
import logging
import threading
import uuid
import time

from lumen.config import HISTORY_DB

logger = logging.getLogger(__name__)

DB_PATH = HISTORY_DB

_local = threading.local()


def _get_conn(existing_conn: sqlite3.Connection | None = None) -> sqlite3.Connection:
    if existing_conn is not None:
        return existing_conn
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(DATA_DIR, exist_ok=True)
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
        CREATE TABLE IF NOT EXISTS writing_projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            channel_id  TEXT DEFAULT '',   -- 关联的 channel
            metadata    TEXT DEFAULT '{}',  -- JSON：封面、标签、模板等
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS writing_chapters (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '',  -- Markdown 格式
            word_count  INTEGER NOT NULL DEFAULT 0,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            volume      TEXT DEFAULT '',   -- 分卷名
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_wc_project ON writing_chapters(project_id);

        CREATE TABLE IF NOT EXISTS writing_settings (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            parent_id   TEXT DEFAULT NULL,  -- 树形层级
            name        TEXT NOT NULL DEFAULT '',
            category    TEXT NOT NULL DEFAULT 'custom',  -- character|world|location|object|plot|rules|custom
            content     TEXT NOT NULL DEFAULT '{}',      -- JSON
            sort_order  INTEGER NOT NULL DEFAULT 0,
            enabled     INTEGER NOT NULL DEFAULT 1,      -- 是否注入 AI 上下文
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ws_project ON writing_settings(project_id);
        CREATE INDEX IF NOT EXISTS idx_ws_parent ON writing_settings(parent_id);
    """)


# ── 作品管理 ──

def create_project(name: str, description: str = "", channel_id: str = "") -> dict:
    conn = _get_conn()
    pid = f"prj-{uuid.uuid4().hex[:12]}"
    now = time.time()
    conn.execute(
        """INSERT INTO writing_projects (id, name, description, channel_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (pid, name, description, channel_id, now, now),
    )
    conn.commit()
    return _row_to_dict(conn.execute("SELECT * FROM writing_projects WHERE id = ?", (pid,)).fetchone())


def list_projects() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_projects ORDER BY updated_at DESC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_project(project_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM writing_projects WHERE id = ?", (project_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_project(project_id: str, **kwargs) -> dict | None:
    conn = _get_conn()
    allowed = {"name", "description", "channel_id", "metadata"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return get_project(project_id)
    updates["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id]
    conn.execute(
        f"UPDATE writing_projects SET {set_clause} WHERE id = ?", values
    )
    conn.commit()
    return get_project(project_id)


def delete_project(project_id: str) -> bool:
    conn = _get_conn()
    conn.execute("DELETE FROM writing_settings WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM writing_chapters WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM writing_projects WHERE id = ?", (project_id,))
    conn.commit()
    return True


# ── 章节管理 ──

def create_chapter(project_id: str, title: str = "", volume: str = "") -> dict:
    conn = _get_conn()
    cid = f"ch-{uuid.uuid4().hex[:12]}"
    now = time.time()
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_chapters WHERE project_id = ?",
        (project_id,),
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO writing_chapters (id, project_id, title, sort_order, volume, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (cid, project_id, title, max_order, volume, now, now),
    )
    conn.commit()
    return _row_to_dict(conn.execute("SELECT * FROM writing_chapters WHERE id = ?", (cid,)).fetchone())


def list_chapters(project_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_chapters WHERE project_id = ? ORDER BY sort_order",
        (project_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_chapter(chapter_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM writing_chapters WHERE id = ?", (chapter_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_chapter(chapter_id: str, **kwargs) -> dict | None:
    conn = _get_conn()
    allowed = {"title", "content", "word_count", "volume"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return get_chapter(chapter_id)
    updates["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [chapter_id]
    conn.execute(
        f"UPDATE writing_chapters SET {set_clause} WHERE id = ?", values
    )
    conn.commit()
    return get_chapter(chapter_id)


def delete_chapter(chapter_id: str) -> bool:
    conn = _get_conn()
    conn.execute("DELETE FROM writing_chapters WHERE id = ?", (chapter_id,))
    conn.commit()
    return True


def reorder_chapters(project_id: str, ordered_ids: list[str]):
    conn = _get_conn()
    for i, cid in enumerate(ordered_ids):
        conn.execute(
            "UPDATE writing_chapters SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?",
            (i, time.time(), cid, project_id),
        )
    conn.commit()


# ── 世界观设定管理 ──

def create_setting(project_id: str, name: str, category: str = "custom",
                   parent_id: str | None = None, content: dict | None = None) -> dict:
    conn = _get_conn()
    sid = f"set-{uuid.uuid4().hex[:12]}"
    now = time.time()
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_settings WHERE project_id = ? AND parent_id IS ?",
        (project_id, parent_id),
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO writing_settings (id, project_id, parent_id, name, category, content, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (sid, project_id, parent_id, name, category, json.dumps(content or {}, ensure_ascii=False),
         max_order, now, now),
    )
    conn.commit()
    return _row_to_dict(conn.execute("SELECT * FROM writing_settings WHERE id = ?", (sid,)).fetchone())


def list_settings(project_id: str, category: str | None = None) -> list[dict]:
    conn = _get_conn()
    if category:
        rows = conn.execute(
            "SELECT * FROM writing_settings WHERE project_id = ? AND category = ? ORDER BY sort_order",
            (project_id, category),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM writing_settings WHERE project_id = ? ORDER BY category, sort_order",
            (project_id,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_setting(setting_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM writing_settings WHERE id = ?", (setting_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_setting(setting_id: str, **kwargs) -> dict | None:
    conn = _get_conn()
    allowed = {"name", "category", "content", "enabled", "parent_id"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return get_setting(setting_id)
    if "content" in updates and isinstance(updates["content"], dict):
        updates["content"] = json.dumps(updates["content"], ensure_ascii=False)
    updates["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [setting_id]
    conn.execute(f"UPDATE writing_settings SET {set_clause} WHERE id = ?", values)
    conn.commit()
    return get_setting(setting_id)


def delete_setting(setting_id: str) -> bool:
    conn = _get_conn()
    # 级联删除子节点
    conn.execute("DELETE FROM writing_settings WHERE parent_id = ?", (setting_id,))
    conn.execute("DELETE FROM writing_settings WHERE id = ?", (setting_id,))
    conn.commit()
    return True


def reorder_settings(ordered_ids: list[str]):
    conn = _get_conn()
    for i, sid in enumerate(ordered_ids):
        conn.execute(
            "UPDATE writing_settings SET sort_order = ?, updated_at = ? WHERE id = ?",
            (i, time.time(), sid),
        )
    conn.commit()


# ── 辅助 ──

def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    # 解析 JSON 字段
    for key in ("content", "metadata"):
        if key in d and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    return d
