"""
T25 WorldStateService — RPG 世界状态黑板

SQLite 存储 Agent 的位置、属性、HP 等游戏状态。
与 TriviumDB（图谱关系）互补：WorldState 管"快照"，TriviumDB 管"关系"。

纯同步层 — API 路由通过 asyncio.to_thread() 调用。
"""

import sqlite3
import os
import json
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "world_state.db")

_local = threading.local()
_write_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
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
        CREATE TABLE IF NOT EXISTS agent_state (
            agent_id  TEXT PRIMARY KEY,
            name      TEXT NOT NULL DEFAULT '',
            room_id   TEXT NOT NULL DEFAULT '',
            hp        INTEGER NOT NULL DEFAULT 100,
            max_hp    INTEGER NOT NULL DEFAULT 100,
            attrs     TEXT NOT NULL DEFAULT '{}',
            status    TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rooms (
            room_id   TEXT PRIMARY KEY,
            name      TEXT NOT NULL DEFAULT '',
            metadata  TEXT NOT NULL DEFAULT '{}'
        );
    """)

    # 迁移：给已有表加 name 列
    cols = [row["name"] for row in conn.execute("PRAGMA table_info(agent_state)").fetchall()]
    if "name" not in cols:
        conn.execute("ALTER TABLE agent_state ADD COLUMN name TEXT NOT NULL DEFAULT ''")

    conn.commit()


# ── Agent 状态 CRUD ──

def get_agent_state(agent_id: str) -> Optional[dict]:
    """获取 Agent 完整状态，不存在返回 None"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM agent_state WHERE agent_id = ?", (agent_id,)
    ).fetchone()
    if not row:
        return None
    return {
        "agent_id": row["agent_id"],
        "name": row["name"],
        "room_id": row["room_id"],
        "hp": row["hp"],
        "max_hp": row["max_hp"],
        "attrs": json.loads(row["attrs"]),
        "status": json.loads(row["status"]),
    }


def ensure_agent(agent_id: str, room_id: str = "start", **defaults) -> dict:
    """确保 Agent 存在（不存在则创建），返回完整状态"""
    state = get_agent_state(agent_id)
    if state:
        return state

    name = defaults.get("name", agent_id)
    attrs = defaults.get("attrs", {})
    hp = defaults.get("hp", 100)
    max_hp = defaults.get("max_hp", hp)

    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO agent_state (agent_id, name, room_id, hp, max_hp, attrs) VALUES (?, ?, ?, ?, ?, ?)",
            (agent_id, name, room_id, hp, max_hp, json.dumps(attrs, ensure_ascii=False)),
        )
        conn.commit()

    return get_agent_state(agent_id)


def update_agent(agent_id: str, **fields) -> Optional[dict]:
    """更新 Agent 状态字段，返回更新后的完整状态"""
    valid_keys = {"name", "room_id", "hp", "max_hp", "attrs", "status"}
    updates = {}
    params = []

    for key, value in fields.items():
        if key in valid_keys:
            updates[key] = value
            if isinstance(value, dict):
                params.append(json.dumps(value, ensure_ascii=False))
            else:
                params.append(value)

    if not updates:
        return get_agent_state(agent_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    params.append(agent_id)

    with _write_lock:
        conn = _get_conn()
        conn.execute(
            f"UPDATE agent_state SET {set_clause}, updated_at = datetime('now') WHERE agent_id = ?",
            params,
        )
        conn.commit()

    return get_agent_state(agent_id)


def remove_agent(agent_id: str) -> bool:
    """移除 Agent 状态，返回是否成功"""
    with _write_lock:
        conn = _get_conn()
        cursor = conn.execute("DELETE FROM agent_state WHERE agent_id = ?", (agent_id,))
        conn.commit()
        return cursor.rowcount > 0


# ── 名字查询（Gemini 陷阱 1 防御）──

def find_agent_by_name(name: str, room_id: str = "") -> Optional[str]:
    """按名字模糊查找 Agent ID（同名取第一个）

    优先精确匹配，然后不区分大小写包含匹配。
    如果指定 room_id，只在该房间内查找。
    """
    conn = _get_conn()

    # 精确匹配
    if room_id:
        row = conn.execute(
            "SELECT agent_id FROM agent_state WHERE name = ? AND room_id = ?",
            (name, room_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT agent_id FROM agent_state WHERE name = ?",
            (name,),
        ).fetchone()
    if row:
        return row["agent_id"]

    # 模糊包含匹配（大小写不敏感）
    pattern = f"%{name}%"
    if room_id:
        row = conn.execute(
            "SELECT agent_id FROM agent_state WHERE name LIKE ? AND room_id = ?",
            (pattern, room_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT agent_id FROM agent_state WHERE name LIKE ?",
            (pattern,),
        ).fetchone()

    return row["agent_id"] if row else None


def resolve_agent_id(id_or_name: str, room_id: str = "") -> Optional[str]:
    """解析 Agent 标识：先当 ID 查，找不到再当名字查"""
    state = get_agent_state(id_or_name)
    if state:
        return id_or_name
    return find_agent_by_name(id_or_name, room_id)


def get_room_entities(room_id: str) -> list[dict]:
    """获取房间内所有实体（id + name + 简要状态），用于注入 LLM 上下文"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT agent_id, name, hp, max_hp FROM agent_state WHERE room_id = ?",
        (room_id,),
    ).fetchall()
    return [
        {
            "id": row["agent_id"],
            "name": row["name"] or row["agent_id"],
            "hp": row["hp"],
            "max_hp": row["max_hp"],
        }
        for row in rows
    ]


# ── Room CRUD ──

def get_room(room_id: str) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
    if not row:
        return None
    return {"room_id": row["room_id"], "name": row["name"], "metadata": json.loads(row["metadata"])}


def ensure_room(room_id: str, name: str = "", **metadata) -> dict:
    room = get_room(room_id)
    if room:
        return room

    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO rooms (room_id, name, metadata) VALUES (?, ?, ?)",
            (room_id, name, json.dumps(metadata, ensure_ascii=False)),
        )
        conn.commit()

    return get_room(room_id)


def list_agents_in_room(room_id: str) -> list[str]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT agent_id FROM agent_state WHERE room_id = ?", (room_id,)
    ).fetchall()
    return [row["agent_id"] for row in rows]


# ── 属性查询快捷方法 ──

def get_attr(agent_id: str, attr_name: str, default: int = 10) -> int:
    """获取 Agent 的单个属性值（默认 10，D&D 标准）"""
    state = get_agent_state(agent_id)
    if not state:
        return default
    return state["attrs"].get(attr_name, default)
