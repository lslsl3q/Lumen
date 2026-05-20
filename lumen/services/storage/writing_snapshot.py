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
    list_acts,
    list_chapters_by_act,
    list_scenes,
    list_codex,
)

logger = logging.getLogger(__name__)

MAX_AUTO_SNAPSHOTS = 50
SNAPSHOT_VERSION = 2


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

    acts = list_acts(project_id)
    settings = list_codex(project_id)

    acts_data = []
    for act in acts:
        act_dict = {k: act[k] for k in ("id", "title", "numerate", "sort_order")}
        chapters = list_chapters_by_act(act["id"])
        ch_data = []
        for ch in chapters:
            ch_dict = {k: ch[k] for k in ("id", "title", "numerate", "show_number", "sort_order")}
            scenes = list_scenes(ch["id"])
            ch_dict["scenes"] = [
                {k: s[k] for k in ("id", "content", "summary", "subtitle", "sort_order")}
                for s in scenes
            ]
            ch_data.append(ch_dict)
        act_dict["chapters"] = ch_data
        acts_data.append(act_dict)

    data = json.dumps({
        "project": {
            "id": project["id"],
            "name": project["name"],
            "description": project.get("description", ""),
            "metadata": project.get("metadata", {}),
        },
        "acts": acts_data,
        "codex": [
            {k: s[k] for k in ("id", "name", "type", "description", "parent_id", "aliases", "tags", "sort_order", "enabled")}
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
            "act_count": len(acts),
            "chapter_count": sum(len(a["chapters"]) for a in acts_data),
            "scene_count": sum(len(ch["scenes"]) for a in acts_data for ch in a["chapters"]),
            "total_words": "N/A (JSON content)",
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
            # 删除当前 acts, chapters, scenes, codex
            conn.execute("DELETE FROM writing_scenes WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM writing_chapters WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM writing_acts WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM codex WHERE project_id = ?", (project_id,))

            version = data.get("snapshot_version", 1)

            if version == 1:
                # V1: old flat chapters — restore as 1 Act > 1 Chapter > 1 Scene per old chapter
                for ch in data.get("chapters", []):
                    now = time.time()
                    act_id = f"act-{uuid.uuid4().hex[:12]}"
                    conn.execute(
                        "INSERT INTO writing_acts (id, project_id, title, numerate, sort_order, created_at, updated_at) VALUES (?, ?, '', 1, ?, ?, ?)",
                        (act_id, project_id, ch.get("sort_order", 0), now, now),
                    )
                    conn.execute(
                        "INSERT INTO writing_chapters (id, act_id, project_id, title, numerate, show_number, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?)",
                        (ch["id"], act_id, project_id, ch["title"], now, now),
                    )
                    sc_content = ch.get("content", "")
                    conn.execute(
                        "INSERT INTO writing_scenes (id, chapter_id, content, summary, sort_order, created_at, updated_at) VALUES (?, ?, ?, '', 0, ?, ?)",
                        (f"sc-{uuid.uuid4().hex[:12]}", ch["id"], sc_content, now, now),
                    )
            else:
                # V2: nested acts > chapters > scenes
                for act in data.get("acts", []):
                    now = time.time()
                    conn.execute(
                        "INSERT INTO writing_acts (id, project_id, title, numerate, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (act["id"], project_id, act.get("title", ""), act.get("numerate", 1), act.get("sort_order", 0), now, now),
                    )
                    for ch in act.get("chapters", []):
                        conn.execute(
                            "INSERT INTO writing_chapters (id, act_id, project_id, title, numerate, show_number, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (ch["id"], act["id"], project_id, ch.get("title", ""), ch.get("numerate", 1), ch.get("show_number", 1), ch.get("sort_order", 0), now, now),
                        )
                        for sc in ch.get("scenes", []):
                            content = json.dumps(sc["content"]) if isinstance(sc["content"], dict) else sc["content"]
                            conn.execute(
                                "INSERT INTO writing_scenes (id, chapter_id, content, summary, subtitle, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                (sc["id"], ch["id"], content, sc.get("summary", ""), sc.get("subtitle", ""), sc.get("sort_order", 0), now, now),
                            )

            # 从快照恢复 codex
            for s in data.get("codex", []):
                now = time.time()
                desc_json = json.dumps(s.get("description", {}), ensure_ascii=False) if isinstance(s.get("description"), dict) else (s.get("description") or "{}")
                aliases_json = json.dumps(s.get("aliases", []), ensure_ascii=False) if isinstance(s.get("aliases"), list) else "[]"
                tags_json = json.dumps(s.get("tags", []), ensure_ascii=False) if isinstance(s.get("tags"), list) else "[]"
                conn.execute(
                    """INSERT INTO codex (id, project_id, parent_id, name, type, description, aliases, tags, sort_order, enabled, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (s["id"], project_id, s.get("parent_id"), s["name"], s.get("type", "custom"),
                     desc_json, aliases_json, tags_json, s.get("sort_order", 0), s.get("enabled", 1), now, now),
                )

            # 兼容旧快照（V2 含 settings 字段而非 codex）
            for s in data.get("settings", []):
                if data.get("codex"):
                    break  # 已从 codex 字段恢复，跳过旧 settings
                now = time.time()
                desc_json = json.dumps(s.get("content", {}), ensure_ascii=False) if isinstance(s.get("content"), dict) else (s.get("content") or "{}")
                conn.execute(
                    """INSERT INTO codex (id, project_id, parent_id, name, type, description, aliases, tags, sort_order, enabled, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (s["id"], project_id, s.get("parent_id"), s["name"], s.get("category", "custom"),
                     desc_json, "[]", "[]", s.get("sort_order", 0), s.get("enabled", 1), now, now),
                )

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "restored_at": time.time(),
        "backup_snapshot_id": backup["id"],
        "act_count": len(data.get("acts", [])),
        "chapter_count": sum(len(a.get("chapters", [])) for a in data.get("acts", [])),
        "scene_count": sum(len(ch.get("scenes", [])) for a in data.get("acts", []) for ch in a.get("chapters", [])),
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
