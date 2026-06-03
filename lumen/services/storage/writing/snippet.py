"""
snippet — Snippet CRUD（独立文本片段：草稿/灵感/笔记）

表：writing_snippets
"""

import time

from ._base import get_conn, write_lock

__all__ = [
    "create_snippet", "list_snippets", "get_snippet", "update_snippet", "delete_snippet",
]


def create_snippet(project_id: str, name: str = "") -> dict:
    with write_lock:
        conn = get_conn()
        # ID format matches the rest of writing modules
        import uuid
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
