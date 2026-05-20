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
            scene_number INTEGER NOT NULL DEFAULT 0,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            created_at   REAL NOT NULL,
            updated_at   REAL NOT NULL,
            FOREIGN KEY (chapter_id) REFERENCES writing_chapters(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ws_chapter ON writing_scenes(chapter_id);

        CREATE TABLE IF NOT EXISTS writing_settings (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            parent_id   TEXT DEFAULT NULL,
            name        TEXT NOT NULL DEFAULT '',
            category    TEXT NOT NULL DEFAULT 'custom',
            content     TEXT NOT NULL DEFAULT '{}',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ws_project ON writing_settings(project_id);
        CREATE INDEX IF NOT EXISTS idx_ws_parent ON writing_settings(parent_id);

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
    """)


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
        updates["updated_at"] = time.time()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [project_id]
        conn.execute(
            f"UPDATE writing_projects SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
    return get_project(project_id)


def delete_project(project_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM writing_settings WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM writing_chapters WHERE project_id = ?", (project_id,))
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
        allowed = {"title", "numerate", "show_number"}
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
        allowed = {"content", "summary", "subtitle"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return get_scene(scene_id)
        if "content" in updates and isinstance(updates["content"], dict):
            updates["content"] = json.dumps(updates["content"], ensure_ascii=False)
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


# ── 世界观设定管理 ──

def create_setting(project_id: str, name: str, category: str = "custom",
                   parent_id: str | None = None, content: dict | None = None) -> dict:
    with write_lock:
        conn = get_conn()
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
    conn = get_conn()
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
    conn = get_conn()
    row = conn.execute("SELECT * FROM writing_settings WHERE id = ?", (setting_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_setting(setting_id: str, **kwargs) -> dict | None:
    with write_lock:
        conn = get_conn()
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
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM writing_settings WHERE parent_id = ?", (setting_id,))
            conn.execute("DELETE FROM writing_settings WHERE id = ?", (setting_id,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return True


def reorder_settings(ordered_ids: list[str]):
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for i, sid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE writing_settings SET sort_order = ?, updated_at = ? WHERE id = ?",
                    (i, time.time(), sid),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise


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
