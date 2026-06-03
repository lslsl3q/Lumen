"""
chat — Chat Thread / Message CRUD（写作模式对话持久化）

表：writing_chat_threads, writing_chat_messages
"""

import time
import uuid

from ._base import get_conn, write_lock

__all__ = [
    "create_chat_thread", "list_chat_threads", "get_chat_thread",
    "update_chat_thread", "delete_chat_thread",
    "create_chat_message", "list_chat_messages",
]


def create_chat_thread(book_id: str, name: str = "", ai_mode: str = "chat") -> dict:
    tid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO writing_chat_threads (id, book_id, name, ai_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (tid, book_id, name, ai_mode, now, now),
        )
        conn.commit()
    return {"id": tid, "book_id": book_id, "name": name, "ai_mode": ai_mode,
            "pinned": 0, "pinned_side": "right", "created_at": now, "updated_at": now}


def list_chat_threads(book_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        """SELECT t.*,
                  (SELECT COUNT(*) FROM writing_chat_messages m WHERE m.thread_id = t.id) AS message_count
           FROM writing_chat_threads t
           WHERE t.book_id = ?
           ORDER BY t.pinned DESC, t.updated_at DESC""",
        (book_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_chat_thread(thread_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        """SELECT t.*,
                  (SELECT COUNT(*) FROM writing_chat_messages m WHERE m.thread_id = t.id) AS message_count
           FROM writing_chat_threads t WHERE t.id = ?""",
        (thread_id,),
    ).fetchone()
    return dict(row) if row else None


def update_chat_thread(thread_id: str, **fields) -> dict | None:
    allowed = {"name", "ai_mode", "pinned", "pinned_side"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_chat_thread(thread_id)
    updates["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with write_lock:
        conn = get_conn()
        conn.execute(
            f"UPDATE writing_chat_threads SET {set_clause} WHERE id = ?",
            (*updates.values(), thread_id),
        )
        conn.commit()
    return get_chat_thread(thread_id)


def delete_chat_thread(thread_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM writing_chat_threads WHERE id = ?", (thread_id,))
        conn.commit()


def create_chat_message(thread_id: str, role: str, content: str, metadata: str | None = None,
                        book_id: str = "") -> dict:
    mid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO writing_chat_messages (id, thread_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (mid, thread_id, role, content, metadata, now),
        )
        conn.execute(
            "UPDATE writing_chat_threads SET updated_at = ? WHERE id = ?",
            (now, thread_id),
        )
        conn.commit()
    return {"id": mid, "thread_id": thread_id, "role": role, "content": content,
            "metadata": metadata, "created_at": now, "book_id": book_id}


def list_chat_messages(thread_id: str, limit: int = 100, before: float | None = None) -> list[dict]:
    conn = get_conn()
    if before:
        rows = conn.execute(
            "SELECT * FROM writing_chat_messages WHERE thread_id = ? AND created_at < ? ORDER BY created_at ASC LIMIT ?",
            (thread_id, before, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM writing_chat_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT ?",
            (thread_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]
