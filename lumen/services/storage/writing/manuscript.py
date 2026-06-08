"""
manuscript — Project / Act / Chapter / Scene CRUD + 手稿聚合查询

表：writing_projects, writing_acts, writing_chapters, writing_scenes
"""

import json
import time
import uuid

from ._base import get_conn, write_lock, _row_to_dict

__all__ = [
    "create_project", "list_projects", "get_project", "update_project", "delete_project",
    "create_act", "list_acts", "get_act", "update_act", "delete_act", "reorder_acts",
    "create_chapter", "list_chapters", "list_chapters_by_act", "get_chapter",
    "update_chapter", "delete_chapter", "reorder_chapters",
    "create_scene", "list_scenes", "get_scene", "update_scene", "delete_scene", "reorder_scenes",
    "get_manuscript", "get_manuscript_flat",
]


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
        # Global chapter number across all acts in this project
        max_numerate = conn.execute(
            "SELECT COALESCE(MAX(numerate), 0) FROM writing_chapters WHERE project_id = ?",
            (project_id,),
        ).fetchone()[0]
        conn.execute(
            """INSERT INTO writing_chapters (id, act_id, project_id, title, numerate, show_number, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)""",
            (cid, act_id, project_id, title, max_numerate + 1, max_order, now, now),
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
        allowed = {"content", "summary", "subtitle", "chapter_id", "codex_ids", "label_ids", "pov_codex_id"}
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


# ── 手稿批量加载 ──

def get_manuscript(project_id: str) -> dict:
    """Return full manuscript tree: acts -> chapters -> scenes (nested)."""
    acts = list_acts(project_id)
    result_acts = []
    for act in acts:
        act_dict = dict(act)
        chapters = list_chapters_by_act(act["id"])
        act_chapters = []
        for ch in chapters:
            ch_dict = dict(ch)
            scenes = list_scenes(ch["id"])
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
