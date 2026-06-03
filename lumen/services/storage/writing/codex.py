"""
codex — Codex (世界观设定) + Label (场景标签) CRUD

表：codex, writing_labels
"""

import json
import time
import uuid

from ._base import get_conn, write_lock, _row_to_dict

__all__ = [
    "create_codex", "list_codex", "get_codex", "update_codex", "delete_codex", "reorder_codex",
    "create_label", "list_labels", "update_label", "delete_label", "reorder_labels",
]


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
