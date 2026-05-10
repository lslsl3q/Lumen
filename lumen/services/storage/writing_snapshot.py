"""
写作快照服务 — 自动/手动快照的创建、列表、恢复、删除

快照 = 项目某一时刻的全量数据（chapters + settings），
存储为 JSON 字符串在 writing_snapshots 表中。
恢复时先自动创建 pre_restore 备份，再事务中替换数据。

复用 writing.py 的连接和写锁，确保同库同锁无竞态。
纯同步层 — API 路由通过 asyncio.to_thread() 调用。
"""

import json
import logging
import sqlite3
import time
import uuid

from lumen.services.storage.writing import (
    get_conn,
    write_lock,
    get_project,
    list_chapters,
    list_settings,
)

logger = logging.getLogger(__name__)

MAX_AUTO_SNAPSHOTS = 50
SNAPSHOT_VERSION = 1


def _init_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS writing_snapshots (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            type        TEXT NOT NULL DEFAULT 'auto',
            label       TEXT DEFAULT '',
            data        TEXT NOT NULL DEFAULT '{}',
            size_bytes  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wsnap_project
            ON writing_snapshots(project_id, created_at DESC);
    """)


def _ensure_tables():
    conn = get_conn()
    _init_tables(conn)


# 首次导入时确保快照表存在
try:
    _ensure_tables()
except Exception:
    pass


# ── 快照 CRUD ──

def create_snapshot(project_id: str, snap_type: str = "auto", label: str = "") -> dict:
    """创建全量快照，自动清理超限的旧自动快照。"""
    project = get_project(project_id)
    if not project:
        raise ValueError(f"项目 {project_id} 不存在")

    chapters = list_chapters(project_id)
    settings = list_settings(project_id)

    data = json.dumps({
        "project": {
            "id": project["id"],
            "name": project["name"],
            "description": project.get("description", ""),
            "metadata": project.get("metadata", {}),
        },
        "chapters": [
            {k: ch[k] for k in ("id", "title", "content", "word_count", "sort_order", "volume")}
            for ch in chapters
        ],
        "settings": [
            {k: s[k] for k in ("id", "name", "category", "content", "parent_id", "sort_order", "enabled")}
            for s in settings
        ],
        "snapshot_version": SNAPSHOT_VERSION,
    }, ensure_ascii=False)

    snap_id = f"snap-{uuid.uuid4().hex[:12]}"
    now = time.time()
    size = len(data.encode("utf-8"))

    with write_lock:
        conn = get_conn()
        conn.execute(
            """INSERT INTO writing_snapshots (id, project_id, type, label, data, size_bytes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (snap_id, project_id, snap_type, label, data, size, now),
        )
        conn.commit()

        if snap_type == "auto":
            _enforce_auto_limit(conn, project_id)

    return {
        "id": snap_id,
        "project_id": project_id,
        "type": snap_type,
        "label": label,
        "size_bytes": size,
        "created_at": now,
        "stats": {
            "chapter_count": len(chapters),
            "total_words": sum(ch.get("word_count", 0) for ch in chapters),
            "setting_count": len(settings),
        },
    }


def list_snapshots(project_id: str, limit: int = 50) -> list[dict]:
    """列出快照元信息（不含 data 字段），按时间倒序。"""
    conn = get_conn()
    rows = conn.execute(
        """SELECT id, project_id, type, label, size_bytes, created_at
           FROM writing_snapshots
           WHERE project_id = ?
           ORDER BY created_at DESC
           LIMIT ?""",
        (project_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def get_snapshot_detail(snapshot_id: str) -> dict | None:
    """获取快照完整数据（含 data）。"""
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM writing_snapshots WHERE id = ?",
        (snapshot_id,),
    ).fetchone()
    if not row:
        return None
    d = dict(row)
    if isinstance(d.get("data"), str):
        try:
            d["data"] = json.loads(d["data"])
        except json.JSONDecodeError:
            pass
    return d


def restore_snapshot(snapshot_id: str) -> dict:
    """恢复快照：先创建 pre_restore 备份，再事务中替换数据。"""
    detail = get_snapshot_detail(snapshot_id)
    if not detail:
        raise ValueError(f"快照 {snapshot_id} 不存在")

    project_id = detail["project_id"]
    data = detail["data"]

    # 恢复前自动备份当前状态
    backup = create_snapshot(project_id, snap_type="pre_restore", label="恢复前自动备份")

    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            # 删除当前 chapters 和 settings
            conn.execute("DELETE FROM writing_settings WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM writing_chapters WHERE project_id = ?", (project_id,))

            # 从快照恢复 chapters
            for ch in data.get("chapters", []):
                now = time.time()
                conn.execute(
                    """INSERT INTO writing_chapters (id, project_id, title, content, word_count, sort_order, volume, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (ch["id"], project_id, ch["title"], ch["content"],
                     ch.get("word_count", 0), ch.get("sort_order", 0),
                     ch.get("volume", ""), now, now),
                )

            # 从快照恢复 settings
            for s in data.get("settings", []):
                now = time.time()
                content_json = json.dumps(s["content"], ensure_ascii=False) if isinstance(s["content"], dict) else s["content"]
                conn.execute(
                    """INSERT INTO writing_settings (id, project_id, parent_id, name, category, content, sort_order, enabled, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (s["id"], project_id, s.get("parent_id"), s["name"], s["category"],
                     content_json, s.get("sort_order", 0), s.get("enabled", 1), now, now),
                )

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "restored_at": time.time(),
        "backup_snapshot_id": backup["id"],
        "chapter_count": len(data.get("chapters", [])),
        "setting_count": len(data.get("settings", [])),
    }


def delete_snapshot(snapshot_id: str) -> bool:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM writing_snapshots WHERE id = ?", (snapshot_id,))
        conn.commit()
    return True


def delete_all_snapshots(project_id: str) -> int:
    with write_lock:
        conn = get_conn()
        cursor = conn.execute("DELETE FROM writing_snapshots WHERE project_id = ?", (project_id,))
        conn.commit()
    return cursor.rowcount


# ── 内部辅助 ──

def _enforce_auto_limit(conn: sqlite3.Connection, project_id: str):
    """自动快照超过上限时，删除最老的。"""
    rows = conn.execute(
        """SELECT id FROM writing_snapshots
           WHERE project_id = ? AND type = 'auto'
           ORDER BY created_at ASC""",
        (project_id,),
    ).fetchall()
    excess = len(rows) - MAX_AUTO_SNAPSHOTS
    if excess > 0:
        for row in rows[:excess]:
            conn.execute("DELETE FROM writing_snapshots WHERE id = ?", (row[0],))
        conn.commit()
