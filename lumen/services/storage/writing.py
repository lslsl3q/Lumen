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

from lumen.config import WRITING_DB

logger = logging.getLogger(__name__)

DB_PATH = WRITING_DB

_local = threading.local()
write_lock = threading.Lock()


def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
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
            channel_id  TEXT DEFAULT '',
            metadata    TEXT DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL
        );

        -- NEW: Acts table
        CREATE TABLE IF NOT EXISTS writing_acts (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            numerate    INTEGER NOT NULL DEFAULT 1,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wa_project ON writing_acts(project_id);

        -- MODIFIED: Chapters table (removed content/word_count/volume, added act_id/numerate/show_number)
        CREATE TABLE IF NOT EXISTS writing_chapters (
            id          TEXT PRIMARY KEY,
            act_id      TEXT NOT NULL,
            project_id  TEXT NOT NULL DEFAULT '',
            title       TEXT NOT NULL DEFAULT '',
            numerate    INTEGER NOT NULL DEFAULT 1,
            show_number INTEGER NOT NULL DEFAULT 1,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (act_id) REFERENCES writing_acts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wc_act ON writing_chapters(act_id);
        CREATE INDEX IF NOT EXISTS idx_wc_project ON writing_chapters(project_id);

        -- NEW: Scenes table
        CREATE TABLE IF NOT EXISTS writing_scenes (
            id           TEXT PRIMARY KEY,
            chapter_id   TEXT NOT NULL,
            content      TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
            summary      TEXT NOT NULL DEFAULT '',
            subtitle     TEXT NOT NULL DEFAULT '',
            codex_ids    TEXT NOT NULL DEFAULT '[]',
            label_ids    TEXT NOT NULL DEFAULT '[]',
            scene_number INTEGER NOT NULL DEFAULT 0,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            created_at   REAL NOT NULL,
            updated_at   REAL NOT NULL,
            FOREIGN KEY (chapter_id) REFERENCES writing_chapters(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ws_chapter ON writing_scenes(chapter_id);

        CREATE TABLE IF NOT EXISTS codex (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            parent_id   TEXT DEFAULT NULL,
            name        TEXT NOT NULL DEFAULT '',
            type        TEXT NOT NULL DEFAULT 'custom',
            description TEXT NOT NULL DEFAULT '{}',
            aliases     TEXT NOT NULL DEFAULT '[]',
            tags        TEXT NOT NULL DEFAULT '[]',
            custom_fields TEXT NOT NULL DEFAULT '{}',
            relations   TEXT NOT NULL DEFAULT '[]',
            graph_entity_id TEXT DEFAULT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_codex_project ON codex(project_id);
        CREATE INDEX IF NOT EXISTS idx_codex_parent ON codex(parent_id);

        -- Snippets: 独立文本片段（草稿/灵感/笔记）
        CREATE TABLE IF NOT EXISTS writing_snippets (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
            pinned      INTEGER NOT NULL DEFAULT 0,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wsnip_project ON writing_snippets(project_id);

        -- 场景标签
        CREATE TABLE IF NOT EXISTS writing_labels (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            color       TEXT NOT NULL DEFAULT 'Gray',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wlbl_project ON writing_labels(project_id);

        -- 叙事线（标签化，不再限制 main/subplot/dark）
        CREATE TABLE IF NOT EXISTS writing_threads (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            type        TEXT NOT NULL DEFAULT 'dark',
            tags        TEXT NOT NULL DEFAULT '[]',
            name        TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '{}',
            color       TEXT NOT NULL DEFAULT '#6b7280',
            status      TEXT NOT NULL DEFAULT 'active',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            linked_codex_ids TEXT NOT NULL DEFAULT '[]',
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wt_project ON writing_threads(project_id);

        -- 叙事线节点（advance/surface/resolve/background，crossing 改为自动检测）
        CREATE TABLE IF NOT EXISTS writing_thread_nodes (
            id          TEXT PRIMARY KEY,
            thread_id   TEXT NOT NULL,
            type        TEXT NOT NULL DEFAULT 'advance',
            scene_id    TEXT DEFAULT NULL,
            title       TEXT NOT NULL DEFAULT '',
            note        TEXT NOT NULL DEFAULT '',
            story_time  TEXT DEFAULT '',
            goal        INTEGER NOT NULL DEFAULT 0,
            satisfaction TEXT DEFAULT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES writing_threads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wtn_thread ON writing_thread_nodes(thread_id);
        CREATE INDEX IF NOT EXISTS idx_wtn_scene ON writing_thread_nodes(scene_id);
    """)

    # 删旧表（测试数据，无需迁移）
    conn.execute("DROP TABLE IF EXISTS writing_settings")

    # 迁移旧节点类型 → 新类型（event→advance, emergence→surface, seed→surface, crossing→advance）
    _migrate_node_types(conn)


# 旧→新节点类型映射（幂等，已迁移的不会重复执行）
_NODE_TYPE_MIGRATION = {
    "event": "advance",
    "emergence": "surface",
    "seed": "surface",
    "crossing": "advance",
    # resolution→resolve
    "resolution": "resolve",
}


def _migrate_node_types(conn: sqlite3.Connection):
    for old_type, new_type in _NODE_TYPE_MIGRATION.items():
        conn.execute(
            "UPDATE writing_thread_nodes SET type = ? WHERE type = ?",
            (new_type, old_type),
        )
    # 迁移旧列：添加 goal/satisfaction 列（如果不存在）
    _ensure_columns(conn, "writing_thread_nodes", {
        "goal": "INTEGER NOT NULL DEFAULT 0",
        "satisfaction": "TEXT DEFAULT NULL",
    })
    # 迁移 writing_threads：添加 tags 列（如果不存在）
    _ensure_columns(conn, "writing_threads", {
        "tags": "TEXT NOT NULL DEFAULT '[]'",
    })
    # 迁移 writing_scenes：添加 codex_ids 列（如果不存在）
    _ensure_columns(conn, "writing_scenes", {
        "codex_ids": "TEXT NOT NULL DEFAULT '[]'",
        "label_ids": "TEXT NOT NULL DEFAULT '[]'",
    })
    # 迁移 codex：添加 category 列（如果不存在）
    _ensure_columns(conn, "codex", {
        "category": "TEXT DEFAULT NULL",
    })
    conn.commit()


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]):
    for col, definition in columns.items():
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
        except Exception:
            pass  # 列已存在，忽略


# ── 作品管理 ──

def create_project(name: str, description: str = "", channel_id: str = "") -> dict:
    with write_lock:
        conn = get_conn()
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
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_projects ORDER BY updated_at DESC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_project(project_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_projects WHERE id = ?", (project_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_project(project_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"name", "description", "channel_id", "metadata"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_project(project_id)
        if "metadata" in updates and not isinstance(updates["metadata"], str):
            updates["metadata"] = json.dumps(updates["metadata"], ensure_ascii=False)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [project_id]
        conn.execute(
            f"UPDATE writing_projects SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
    return get_project(project_id)


def delete_project(project_id: str) -> bool:
    # 外键 CASCADE 自动删除 acts→chapters→scenes, codex, snippets
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM writing_projects WHERE id = ?", (project_id,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


# ── Act 管理 ──

def create_act(project_id: str, title: str = "", numerate: bool = True) -> dict:
    with write_lock:
        conn = get_conn()
        aid = f"act-{uuid.uuid4().hex[:12]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_acts WHERE project_id = ?",
            (project_id,),
        ).fetchone()[0]
        conn.execute(
            """INSERT INTO writing_acts (id, project_id, title, numerate, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (aid, project_id, title, 1 if numerate else 0, max_order, now, now),
        )
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM writing_acts WHERE id = ?", (aid,)).fetchone())


def list_acts(project_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_acts WHERE project_id = ? ORDER BY sort_order",
        (project_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_act(act_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_acts WHERE id = ?", (act_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_act(act_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"title", "numerate"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_act(act_id)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [act_id]
        conn.execute(f"UPDATE writing_acts SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_act(act_id)


def delete_act(act_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT project_id FROM writing_acts WHERE id = ?", (act_id,)).fetchone()
            project_id = row["project_id"] if row else None
            conn.execute("""
                DELETE FROM writing_scenes WHERE chapter_id IN (
                    SELECT id FROM writing_chapters WHERE act_id = ?
                )
            """, (act_id,))
            conn.execute("DELETE FROM writing_chapters WHERE act_id = ?", (act_id,))
            conn.execute("DELETE FROM writing_acts WHERE id = ?", (act_id,))
            conn.commit()
            if project_id:
                remaining = conn.execute("SELECT id FROM writing_acts WHERE project_id = ? ORDER BY sort_order", (project_id,)).fetchall()
                for i, r in enumerate(remaining):
                    conn.execute("UPDATE writing_acts SET sort_order = ? WHERE id = ?", (i, r["id"]))
                conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_acts(project_id: str, ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, aid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE writing_acts SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?",
                    (i, time.time(), aid, project_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ── 章节管理（新版：关联到 Act）──

def create_chapter(act_id: str, project_id: str, title: str = "") -> dict:
    with write_lock:
        conn = get_conn()
        cid = f"ch-{uuid.uuid4().hex[:12]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_chapters WHERE act_id = ?",
            (act_id,),
        ).fetchone()[0]
        conn.execute(
            """INSERT INTO writing_chapters (id, act_id, project_id, title, numerate, show_number, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)""",
            (cid, act_id, project_id, title, max_order, now, now),
        )
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM writing_chapters WHERE id = ?", (cid,)).fetchone())


def list_chapters(project_id: str) -> list[dict]:
    """List all chapters for a project, ordered by act.sort_order then chapter.sort_order."""
    conn = get_conn()
    rows = conn.execute(
        """SELECT c.* FROM writing_chapters c
           JOIN writing_acts a ON c.act_id = a.id
           WHERE c.project_id = ?
           ORDER BY a.sort_order, c.sort_order""",
        (project_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def list_chapters_by_act(act_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_chapters WHERE act_id = ? ORDER BY sort_order",
        (act_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_chapter(chapter_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_chapters WHERE id = ?", (chapter_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_chapter(chapter_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"title", "numerate", "show_number", "act_id"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_chapter(chapter_id)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [chapter_id]
        conn.execute(f"UPDATE writing_chapters SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_chapter(chapter_id)


def delete_chapter(chapter_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT act_id FROM writing_chapters WHERE id = ?", (chapter_id,)).fetchone()
            act_id = row["act_id"] if row else None
            conn.execute("DELETE FROM writing_scenes WHERE chapter_id = ?", (chapter_id,))
            conn.execute("DELETE FROM writing_chapters WHERE id = ?", (chapter_id,))
            conn.commit()
            if act_id:
                remaining = conn.execute("SELECT id FROM writing_chapters WHERE act_id = ? ORDER BY sort_order", (act_id,)).fetchall()
                for i, r in enumerate(remaining):
                    conn.execute("UPDATE writing_chapters SET sort_order = ? WHERE id = ?", (i, r["id"]))
                conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_chapters(act_id: str, ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, cid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE writing_chapters SET sort_order = ?, updated_at = ? WHERE id = ? AND act_id = ?",
                    (i, time.time(), cid, act_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ── 场景管理 ──

def create_scene(chapter_id: str, content: dict | None = None, summary: str = "", subtitle: str = "") -> dict:
    with write_lock:
        conn = get_conn()
        sid = f"sc-{uuid.uuid4().hex[:12]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_scenes WHERE chapter_id = ?",
            (chapter_id,),
        ).fetchone()[0]
        default_content = json.dumps({"type": "doc", "content": [{"type": "paragraph"}]})
        content_str = json.dumps(content) if content else default_content
        conn.execute(
            """INSERT INTO writing_scenes (id, chapter_id, content, summary, subtitle, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (sid, chapter_id, content_str, summary, subtitle, max_order, now, now),
        )
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM writing_scenes WHERE id = ?", (sid,)).fetchone())


def list_scenes(chapter_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_scenes WHERE chapter_id = ? ORDER BY sort_order",
        (chapter_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_scene(scene_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_scenes WHERE id = ?", (scene_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_scene(scene_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"content", "summary", "subtitle", "chapter_id", "codex_ids", "label_ids"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_scene(scene_id)
        if "content" in updates and isinstance(updates["content"], dict):
            updates["content"] = json.dumps(updates["content"], ensure_ascii=False)
        if "codex_ids" in updates and isinstance(updates["codex_ids"], list):
            updates["codex_ids"] = json.dumps(updates["codex_ids"], ensure_ascii=False)
        if "label_ids" in updates and isinstance(updates["label_ids"], list):
            updates["label_ids"] = json.dumps(updates["label_ids"], ensure_ascii=False)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [scene_id]
        conn.execute(f"UPDATE writing_scenes SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_scene(scene_id)


def delete_scene(scene_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT chapter_id FROM writing_scenes WHERE id = ?", (scene_id,)).fetchone()
            chapter_id = row["chapter_id"] if row else None
            conn.execute("DELETE FROM writing_scenes WHERE id = ?", (scene_id,))
            conn.commit()
            if chapter_id:
                remaining = conn.execute("SELECT id FROM writing_scenes WHERE chapter_id = ? ORDER BY sort_order", (chapter_id,)).fetchall()
                for i, r in enumerate(remaining):
                    conn.execute("UPDATE writing_scenes SET sort_order = ? WHERE id = ?", (i, r["id"]))
                conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_scenes(chapter_id: str, ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, sid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE writing_scenes SET sort_order = ?, updated_at = ? WHERE id = ? AND chapter_id = ?",
                    (i, time.time(), sid, chapter_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ── Codex (世界观设定) ──

def create_codex(project_id: str, name: str, type: str = "custom",
                 parent_id: str | None = None, description: dict | None = None,
                 aliases: list | None = None, tags: list | None = None,
                 category: str | None = None) -> dict:
    with write_lock:
        conn = get_conn()
        sid = f"cdx-{uuid.uuid4().hex[:12]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM codex WHERE project_id = ? AND parent_id IS ?",
            (project_id, parent_id),
        ).fetchone()[0]
        conn.execute(
            """INSERT INTO codex (id, project_id, parent_id, name, type, description, aliases, tags, category, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (sid, project_id, parent_id, name, type,
             json.dumps(description or {}, ensure_ascii=False),
             json.dumps(aliases or [], ensure_ascii=False),
             json.dumps(tags or [], ensure_ascii=False),
             category,
             max_order, now, now),
        )
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM codex WHERE id = ?", (sid,)).fetchone())


def list_codex(project_id: str, type: str | None = None) -> list[dict]:
    conn = get_conn()
    if type:
        rows = conn.execute(
            "SELECT * FROM codex WHERE project_id = ? AND type = ? ORDER BY sort_order",
            (project_id, type),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM codex WHERE project_id = ? ORDER BY type, sort_order",
            (project_id,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_codex(codex_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM codex WHERE id = ?", (codex_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_codex(codex_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"name", "type", "description", "aliases", "tags", "category",
                   "custom_fields", "relations", "graph_entity_id", "enabled", "parent_id"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_codex(codex_id)
        for json_field in ("description", "custom_fields", "relations", "aliases", "tags"):
            if json_field in updates and not isinstance(updates[json_field], str):
                updates[json_field] = json.dumps(updates[json_field], ensure_ascii=False)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [codex_id]
        conn.execute(f"UPDATE codex SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_codex(codex_id)


def delete_codex(codex_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM codex WHERE parent_id = ?", (codex_id,))
            conn.execute("DELETE FROM codex WHERE id = ?", (codex_id,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_codex(ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, sid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE codex SET sort_order = ?, updated_at = ? WHERE id = ?",
                    (i, time.time(), sid),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ── 标签 (Labels) ──

def create_label(project_id: str, name: str = "", color: str = "Gray") -> dict:
    with write_lock:
        conn = get_conn()
        lid = f"lbl-{uuid.uuid4().hex[:12]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_labels WHERE project_id = ?",
            (project_id,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO writing_labels (id, project_id, name, color, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (lid, project_id, name, color, max_order, now, now),
        )
        conn.commit()
    return {"id": lid, "project_id": project_id, "name": name, "color": color, "sort_order": max_order}


def list_labels(project_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM writing_labels WHERE project_id = ? ORDER BY sort_order", (project_id,)).fetchall()
    return [_row_to_dict(r) for r in rows]


def update_label(label_id: str, **fields) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"name", "color", "sort_order"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            row = conn.execute("SELECT * FROM writing_labels WHERE id = ?", (label_id,)).fetchone()
            return dict(row) if row else None
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE writing_labels SET {set_clause} WHERE id = ?", list(updates.values()) + [label_id])
        conn.commit()
    row = conn.execute("SELECT * FROM writing_labels WHERE id = ?", (label_id,)).fetchone()
    return dict(row) if row else None


def delete_label(label_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM writing_labels WHERE id = ?", (label_id,))
        conn.commit()
    return True


def reorder_labels(project_id: str, ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        for i, lid in enumerate(ordered_ids):
            conn.execute("UPDATE writing_labels SET sort_order = ? WHERE id = ? AND project_id = ?", (i, lid, project_id))
        conn.commit()


# ── 叙事线 (Threads) ──

def create_thread(project_id: str, type: str = "dark", name: str = "",
                  color: str = "#6b7280", description: dict | None = None,
                  linked_codex_ids: list | None = None, tags: list | None = None) -> dict:
    with write_lock:
        conn = get_conn()
        tid = f"thrd-{uuid.uuid4().hex[:10]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_threads WHERE project_id = ?",
            (project_id,),
        ).fetchone()[0]
        # Auto-derive tags from type if not provided
        thread_tags = tags if tags is not None else [type]
        conn.execute(
            """INSERT INTO writing_threads
               (id, project_id, type, tags, name, description, color, status, sort_order, linked_codex_ids, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, '{}', ?, ?)""",
            (tid, project_id, type,
             json.dumps(thread_tags, ensure_ascii=False),
             name,
             json.dumps(description or {}, ensure_ascii=False),
             color, max_order,
             json.dumps(linked_codex_ids or [], ensure_ascii=False),
             now, now),
        )
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM writing_threads WHERE id = ?", (tid,)).fetchone())


def list_threads(project_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_threads WHERE project_id = ? ORDER BY sort_order",
        (project_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_thread(thread_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_threads WHERE id = ?", (thread_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_thread(thread_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"type", "tags", "name", "description", "color", "status", "linked_codex_ids", "metadata"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_thread(thread_id)
        for json_field in ("description", "linked_codex_ids", "metadata", "tags"):
            if json_field in updates and not isinstance(updates[json_field], str):
                updates[json_field] = json.dumps(updates[json_field], ensure_ascii=False)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [thread_id]
        conn.execute(f"UPDATE writing_threads SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_thread(thread_id)


def delete_thread(thread_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT project_id FROM writing_threads WHERE id = ?", (thread_id,)).fetchone()
            project_id = row["project_id"] if row else None
            conn.execute("DELETE FROM writing_threads WHERE id = ?", (thread_id,))
            conn.commit()
            if project_id:
                remaining = conn.execute(
                    "SELECT id FROM writing_threads WHERE project_id = ? ORDER BY sort_order",
                    (project_id,),
                ).fetchall()
                for i, r in enumerate(remaining):
                    conn.execute("UPDATE writing_threads SET sort_order = ? WHERE id = ?", (i, r["id"]))
                conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_threads(project_id: str, ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, tid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE writing_threads SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?",
                    (i, time.time(), tid, project_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


# ── 叙事线节点 (Thread Nodes) ──

def create_thread_node(thread_id: str, type: str = "advance", title: str = "",
                       note: str = "", scene_id: str | None = None,
                       story_time: str = "", goal: bool = False,
                       satisfaction: dict | None = None) -> dict:
    with write_lock:
        conn = get_conn()
        nid = f"tn-{uuid.uuid4().hex[:11]}"
        now = time.time()
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_thread_nodes WHERE thread_id = ?",
            (thread_id,),
        ).fetchone()[0]
        sat_json = json.dumps(satisfaction, ensure_ascii=False) if satisfaction else None
        conn.execute(
            """INSERT INTO writing_thread_nodes
               (id, thread_id, type, scene_id, title, note, story_time, goal, satisfaction, sort_order, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)""",
            (nid, thread_id, type, scene_id, title, note, story_time,
             1 if goal else 0, sat_json,
             max_order, now, now),
        )
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM writing_thread_nodes WHERE id = ?", (nid,)).fetchone())


def list_thread_nodes(thread_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_thread_nodes WHERE thread_id = ? ORDER BY sort_order",
        (thread_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_thread_node(node_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_thread_nodes WHERE id = ?", (node_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_thread_node(node_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
        allowed = {"type", "title", "note", "scene_id", "story_time", "metadata", "goal", "satisfaction"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_thread_node(node_id)
        for json_field in ("metadata", "satisfaction"):
            if json_field in updates and not isinstance(updates[json_field], str):
                updates[json_field] = json.dumps(updates[json_field], ensure_ascii=False)
            if json_field in updates and not isinstance(updates[json_field], str):
                updates[json_field] = json.dumps(updates[json_field], ensure_ascii=False)
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [node_id]
        conn.execute(f"UPDATE writing_thread_nodes SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_thread_node(node_id)


def delete_thread_node(node_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT thread_id FROM writing_thread_nodes WHERE id = ?", (node_id,)).fetchone()
            thread_id = row["thread_id"] if row else None
            conn.execute("DELETE FROM writing_thread_nodes WHERE id = ?", (node_id,))
            conn.commit()
            if thread_id:
                remaining = conn.execute(
                    "SELECT id FROM writing_thread_nodes WHERE thread_id = ? ORDER BY sort_order",
                    (thread_id,),
                ).fetchall()
                for i, r in enumerate(remaining):
                    conn.execute("UPDATE writing_thread_nodes SET sort_order = ? WHERE id = ?", (i, r["id"]))
                conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_thread_nodes(thread_id: str, ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, nid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE writing_thread_nodes SET sort_order = ?, updated_at = ? WHERE id = ? AND thread_id = ?",
                    (i, time.time(), nid, thread_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def get_threads_for_scene(scene_id: str) -> list[dict]:
    """返回绑定了指定 scene_id 的所有节点及其所属线程（用于 PlanView 标记）。"""
    conn = get_conn()
    rows = conn.execute(
        """SELECT n.*, t.name AS thread_name, t.type AS thread_type, t.color AS thread_color, t.status AS thread_status
           FROM writing_thread_nodes n
           JOIN writing_threads t ON n.thread_id = t.id
           WHERE n.scene_id = ?
           ORDER BY t.sort_order, n.sort_order""",
        (scene_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ── 辅助 ──

def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    # 解析 JSON 字段
    for key in ("description", "aliases", "tags", "custom_fields", "relations", "metadata", "linked_codex_ids"):
        if key in d and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    return d


# ── 手稿批量加载 ──

def get_manuscript(project_id: str) -> dict:
    """Return full manuscript tree: acts -> chapters -> scenes (nested)."""
    conn = get_conn()
    acts = list_acts(project_id)
    result_acts = []
    for act in acts:
        act_dict = dict(act)
        chapters = list_chapters_by_act(act["id"])
        act_chapters = []
        for ch in chapters:
            ch_dict = dict(ch)
            scenes = list_scenes(ch["id"])
            # Scenes already have their content JSON-parsed by _row_to_dict
            ch_dict["scenes"] = scenes
            act_chapters.append(ch_dict)
        act_dict["chapters"] = act_chapters
        result_acts.append(act_dict)
    return {"acts": result_acts}


def get_manuscript_flat(project_id: str) -> list[dict]:
    """Return flat list with type field for frontend iteration.

    Order: Act > Chapter > Scene > separator > AddScene > AddChapter > AddAct
    """
    items: list[dict] = []
    for act in list_acts(project_id):
        items.append({"type": "act", **dict(act)})
        for ch in list_chapters_by_act(act["id"]):
            items.append({"type": "chapter", **dict(ch)})
            scenes = list_scenes(ch["id"])
            for i, sc in enumerate(scenes):
                if i > 0:
                    items.append({"type": "separator"})
                items.append({"type": "scene", **dict(sc)})
            items.append({"type": "add-scene", "chapter_id": ch["id"]})
        items.append({"type": "add-chapter", "act_id": act["id"]})
    items.append({"type": "add-act", "project_id": project_id})
    return items


# ── Snippets ──

def create_snippet(project_id: str, name: str = "") -> dict:
    with write_lock:
        conn = get_conn()
        sid = f"snp-{uuid.uuid4().hex[:12]}"
        now = time.time()
        existing = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM writing_snippets WHERE project_id = ?",
            (project_id,)
        ).fetchone()
        sort_order = existing[0] if existing else 0
        conn.execute(
            "INSERT INTO writing_snippets (id, project_id, name, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (sid, project_id, name, sort_order, now, now),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM writing_snippets WHERE id = ?", (sid,)).fetchone())


def list_snippets(project_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM writing_snippets WHERE project_id = ? ORDER BY pinned DESC, sort_order ASC, created_at ASC",
        (project_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_snippet(snippet_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_snippets WHERE id = ?", (snippet_id,)).fetchone()
    return dict(row) if row else None


def update_snippet(snippet_id: str, **fields) -> dict | None:
    # Safe: column names come from hardcoded set, not user input
    allowed = {"name", "content", "pinned", "sort_order"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_snippet(snippet_id)
    updates["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with write_lock:
        conn = get_conn()
        conn.execute(
            f"UPDATE writing_snippets SET {set_clause} WHERE id = ?",
            (*updates.values(), snippet_id),
        )
        conn.commit()
    return get_snippet(snippet_id)


def delete_snippet(snippet_id: str) -> None:
    with write_lock:
        conn = get_conn()
        row = conn.execute("SELECT project_id FROM writing_snippets WHERE id = ?", (snippet_id,)).fetchone()
        if not row:
            return
        project_id = row["project_id"]
        conn.execute("DELETE FROM writing_snippets WHERE id = ?", (snippet_id,))
        remaining = conn.execute(
            "SELECT id FROM writing_snippets WHERE project_id = ? ORDER BY sort_order",
            (project_id,),
        ).fetchall()
        for i, r in enumerate(remaining):
            conn.execute("UPDATE writing_snippets SET sort_order = ? WHERE id = ?", (i, r["id"]))
        conn.commit()
