"""
模板 SQLite 存储层 — 连接管理 + Schema + CRUD + 历史快照

参照 writing/_base.py 的连接管理模式（threading.local + WAL + 外键）。
"""

import sqlite3
import os
import json
import logging
import hashlib
import threading
from datetime import datetime
from typing import Optional

from lumen.config import DB_DIR

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(DB_DIR, "templates.db")

_local = threading.local()


# ── 连接管理 ──

def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA busy_timeout=5000")
        _local.conn.execute("PRAGMA synchronous=NORMAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
        _init_tables(_local.conn)
    return _local.conn


def close_conn():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None


# ── Schema ──

_SCHEMA = """
CREATE TABLE IF NOT EXISTS templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL DEFAULT 'default',
    description TEXT NOT NULL DEFAULT '',
    is_builtin  INTEGER NOT NULL DEFAULT 0,
    user_created INTEGER NOT NULL DEFAULT 0,
    seed_hash   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_inputs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    custom_content    INTEGER NOT NULL DEFAULT 0,
    content_selection INTEGER NOT NULL DEFAULT 0,
    checkbox          INTEGER NOT NULL DEFAULT 0,
    required          INTEGER NOT NULL DEFAULT 0,
    multi             INTEGER NOT NULL DEFAULT 0,
    generate_only     INTEGER NOT NULL DEFAULT 0,
    options           TEXT,
    default_value     TEXT,
    content_types     TEXT,
    add_to_context    INTEGER NOT NULL DEFAULT 0,
    display_name      TEXT,
    placeholder       TEXT,
    allow_formatted_text INTEGER NOT NULL DEFAULT 0,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    source_component  TEXT,
    UNIQUE(template_id, name)
);

CREATE TABLE IF NOT EXISTS template_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    inputs_json   TEXT NOT NULL,
    snapshot_at   TEXT NOT NULL DEFAULT (datetime('now')),
    summary       TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_inputs_template ON template_inputs(template_id);
CREATE INDEX IF NOT EXISTS idx_history_template_time ON template_history(template_id, snapshot_at DESC);
"""


def _init_tables(conn: sqlite3.Connection):
    conn.executescript(_SCHEMA)
    conn.commit()


# ── CRUD ──

def list_templates(category: str = "") -> list[dict]:
    conn = get_conn()
    if category:
        rows = conn.execute(
            "SELECT * FROM templates WHERE category = ? ORDER BY name",
            (category,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM templates ORDER BY category, name").fetchall()

    results = []
    for r in rows:
        t = dict(r)
        t["inputs"] = _get_inputs(conn, r["id"])
        results.append(t)
    return results


def get_template(name: str) -> Optional[dict]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM templates WHERE name = ?", (name,)).fetchone()
    if not row:
        return None
    t = dict(row)
    t["inputs"] = _get_inputs(conn, row["id"])
    return t


def get_template_by_id(template_id: int) -> Optional[dict]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        return None
    t = dict(row)
    t["inputs"] = _get_inputs(conn, row["id"])
    return t


def upsert_template(
    name: str,
    label: str = "",
    type: str = "",
    category: str = "",
    body: str = "",
    model: str = "default",
    description: str = "",
    is_builtin: bool = False,
    user_created: bool = False,
    seed_hash: str = "",
    inputs: list[dict] | None = None,
) -> int:
    conn = get_conn()
    now = datetime.now().isoformat()

    existing = conn.execute("SELECT id FROM templates WHERE name = ?", (name,)).fetchone()
    if existing:
        conn.execute(
            """UPDATE templates SET
                label=?, type=?, category=?, body=?, model=?, description=?,
                is_builtin=?, user_created=?, seed_hash=?, updated_at=?
               WHERE name=?""",
            (label, type, category, body, model, description,
             int(is_builtin), int(user_created), seed_hash, now, name),
        )
        template_id = existing["id"]
    else:
        conn.execute(
            """INSERT INTO templates
                (name, label, type, category, body, model, description,
                 is_builtin, user_created, seed_hash, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (name, label, type, category, body, model, description,
             int(is_builtin), int(user_created), seed_hash, now, now),
        )
        template_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    if inputs is not None:
        _set_inputs(conn, template_id, inputs)

    conn.commit()
    return template_id


def delete_template(name: str) -> bool:
    conn = get_conn()
    cursor = conn.execute("DELETE FROM templates WHERE name = ?", (name,))
    conn.commit()
    return cursor.rowcount > 0


def update_template_body(name: str, body: str) -> bool:
    conn = get_conn()
    now = datetime.now().isoformat()
    cursor = conn.execute(
        "UPDATE templates SET body=?, updated_at=? WHERE name=?",
        (body, now, name),
    )
    conn.commit()
    return cursor.rowcount > 0


def update_template_inputs(name: str, inputs: list[dict]) -> bool:
    conn = get_conn()
    row = conn.execute("SELECT id FROM templates WHERE name = ?", (name,)).fetchone()
    if not row:
        return False
    _set_inputs(conn, row["id"], inputs)
    conn.execute(
        "UPDATE templates SET updated_at=? WHERE id=?",
        (datetime.now().isoformat(), row["id"]),
    )
    conn.commit()
    return True


# ── 历史快照 ──

def create_snapshot(name: str, summary: str = "") -> Optional[int]:
    conn = get_conn()
    row = conn.execute("SELECT id, body FROM templates WHERE name = ?", (name,)).fetchone()
    if not row:
        return None
    inputs = _get_inputs(conn, row["id"])
    inputs_json = json.dumps(inputs, ensure_ascii=False)

    cursor = conn.execute(
        "INSERT INTO template_history (template_id, body, inputs_json, summary) VALUES (?,?,?,?)",
        (row["id"], row["body"], inputs_json, summary),
    )
    conn.commit()
    return cursor.lastrowid


def list_snapshots(name: str, limit: int = 50) -> list[dict]:
    conn = get_conn()
    row = conn.execute("SELECT id FROM templates WHERE name = ?", (name,)).fetchone()
    if not row:
        return []
    rows = conn.execute(
        """SELECT id, body, inputs_json, snapshot_at, summary
           FROM template_history
           WHERE template_id = ?
           ORDER BY snapshot_at DESC
           LIMIT ?""",
        (row["id"], limit),
    ).fetchall()
    return [dict(r) for r in rows]


def restore_snapshot(snapshot_id: int) -> Optional[str]:
    conn = get_conn()
    snap = conn.execute(
        "SELECT template_id, body, inputs_json FROM template_history WHERE id = ?",
        (snapshot_id,),
    ).fetchone()
    if not snap:
        return None

    tmpl = conn.execute("SELECT name FROM templates WHERE id = ?", (snap["template_id"],)).fetchone()
    if not tmpl:
        return None

    inputs = json.loads(snap["inputs_json"])
    now = datetime.now().isoformat()

    conn.execute("UPDATE templates SET body=?, updated_at=? WHERE id=?",
                 (snap["body"], now, snap["template_id"]))
    _set_inputs(conn, snap["template_id"], inputs)
    conn.commit()
    return tmpl["name"]


# ── Seed 同步 ──

def seed_hash_for(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def sync_seed_templates(templates_dir: str):
    """启动时从 .md.j2 文件同步内置模板到 DB。

    - DB 没有的 → INSERT
    - DB 有且是内置的且 seed_hash 不同 → UPDATE（应用更新）
    - 用户修改过的或 DB 独有的 → 不动
    """
    import yaml
    conn = get_conn()
    synced = 0

    for root, _dirs, files in os.walk(templates_dir):
        for f in sorted(files):
            if not f.endswith(".md.j2"):
                continue

            full_path = os.path.join(root, f)
            rel = os.path.relpath(full_path, templates_dir)
            name = rel.removesuffix(".md.j2").replace("\\", "/")

            try:
                with open(full_path, "r", encoding="utf-8") as fh:
                    content = fh.read()
            except IOError:
                continue

            hash_val = seed_hash_for(content)

            # 解析 frontmatter
            meta: dict = {}
            body = content
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    try:
                        meta = yaml.safe_load(parts[1]) or {}
                    except yaml.YAMLError:
                        pass
                    body = parts[2]

            inputs_raw = list(meta.get("inputs") or [])

            existing = conn.execute(
                "SELECT id, seed_hash, is_builtin FROM templates WHERE name = ?",
                (name,),
            ).fetchone()

            if not existing:
                upsert_template(
                    name=name,
                    label=meta.get("name", name),
                    type=meta.get("type", ""),
                    category=meta.get("category", name.split("/")[0]),
                    body=body,
                    model=meta.get("model", "default"),
                    description=meta.get("description", ""),
                    is_builtin=True,
                    user_created=bool(meta.get("user_created", False)),
                    seed_hash=hash_val,
                    inputs=_normalize_inputs(inputs_raw),
                )
                synced += 1
            elif existing["is_builtin"] and existing["seed_hash"] != hash_val:
                upsert_template(
                    name=name,
                    label=meta.get("name", name),
                    type=meta.get("type", ""),
                    category=meta.get("category", name.split("/")[0]),
                    body=body,
                    model=meta.get("model", "default"),
                    description=meta.get("description", ""),
                    is_builtin=True,
                    user_created=bool(meta.get("user_created", False)),
                    seed_hash=hash_val,
                    inputs=_normalize_inputs(inputs_raw),
                )
                synced += 1

    if synced:
        logger.info("模板同步完成: %d 个模板已更新", synced)


# ── Usages 查询 ──

def get_usages(template_name: str) -> list[str]:
    """查找哪些模板 include 了指定模板（SQL LIKE 替代文件扫描）"""
    conn = get_conn()
    component_rel = f"{template_name}.md.j2"
    rows = conn.execute(
        "SELECT name, label FROM templates WHERE body LIKE ?",
        (f"%{component_rel}%",),
    ).fetchall()
    return [r["label"] or r["name"] for r in rows]


# ── Internal helpers ──

def _get_inputs(conn: sqlite3.Connection, template_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM template_inputs WHERE template_id = ? ORDER BY sort_order",
        (template_id,),
    ).fetchall()
    result = []
    for r in rows:
        inp = dict(r)
        if inp.get("options"):
            inp["options"] = json.loads(inp["options"])
        if inp.get("content_types"):
            inp["content_types"] = json.loads(inp["content_types"])
        del inp["id"]
        del inp["template_id"]
        result.append(inp)
    return result


def _set_inputs(conn: sqlite3.Connection, template_id: int, inputs: list[dict]):
    conn.execute("DELETE FROM template_inputs WHERE template_id = ?", (template_id,))
    for i, inp in enumerate(inputs):
        conn.execute(
            """INSERT INTO template_inputs
                (template_id, name, label, description,
                 custom_content, content_selection, checkbox,
                 required, multi, generate_only,
                 options, default_value, content_types,
                 add_to_context, display_name, placeholder,
                 allow_formatted_text, sort_order, source_component)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                template_id,
                inp.get("name", ""),
                inp.get("label", ""),
                inp.get("description", ""),
                int(inp.get("custom_content", False)),
                int(inp.get("content_selection", False)),
                int(inp.get("checkbox", False)),
                int(inp.get("required", False)),
                int(inp.get("multi", False)),
                int(inp.get("generate_only", False)),
                _json_col(inp.get("options")),
                inp.get("default"),
                _json_col(inp.get("content_types")),
                int(inp.get("add_to_context", False)),
                inp.get("display_name"),
                inp.get("placeholder"),
                int(inp.get("allow_formatted_text", False)),
                inp.get("sort_order", i),
                inp.get("source_component"),
            ),
        )


def _json_col(val) -> Optional[str]:
    if val is None:
        return None
    return json.dumps(val, ensure_ascii=False)


def _normalize_inputs(raw: list[dict]) -> list[dict]:
    """确保每个 input 至少有 name 字段"""
    return [inp for inp in raw if inp.get("name")]
