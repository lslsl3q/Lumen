"""
Lumen - 统一权限服务
ACL 表 + 最长路径前缀匹配 + 缓存
纯同步层
"""

import sqlite3
import os
import logging
import threading
from typing import Optional, List, Dict, Tuple

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "permissions.db")

_local = threading.local()
_write_lock = threading.Lock()

DEFAULTS: Dict[str, Dict[str, bool]] = {
    "knowledge": {"read": True, "write": False},
    "diary": {"read": False, "write": False},
}

_instance: Optional["AccessControl"] = None


def _get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn


def _init_tables():
    conn = _get_conn()
    conn.execute("""CREATE TABLE IF NOT EXISTS acl_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        folder_path TEXT DEFAULT '',
        action TEXT NOT NULL,
        access TEXT NOT NULL
    )""")
    conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_acl_unique ON acl_rules(
        character_id, resource_type, resource_id, folder_path, action
    )""")
    conn.commit()


def get_instance() -> "AccessControl":
    global _instance
    if _instance is None:
        _instance = AccessControl()
        _init_tables()
    return _instance


def close():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None
    global _instance
    _instance = None


class AccessControl:
    """统一权限服务 — 单例"""

    def __init__(self):
        self._cache: Dict[Tuple[str, str, str], List[dict]] = {}

    def _cache_key(self, character_id: str, resource_type: str, resource_id: str):
        return (character_id, resource_type, resource_id)

    def _invalidate(self, character_id: str, resource_type: str, resource_id: str):
        self._cache.pop(self._cache_key(character_id, resource_type, resource_id), None)

    def _get_rules(self, character_id: str, resource_type: str, resource_id: str) -> List[dict]:
        key = self._cache_key(character_id, resource_type, resource_id)
        if key not in self._cache:
            conn = _get_conn()
            rows = conn.execute(
                "SELECT * FROM acl_rules WHERE character_id=? AND resource_type=? AND resource_id=?",
                (character_id, resource_type, resource_id),
            ).fetchall()
            self._cache[key] = [dict(r) for r in rows]
        return self._cache[key]

    def _check(self, character_id: str, resource_type: str,
               resource_id: str, folder_path: str, action: str) -> bool:
        rules = self._get_rules(character_id, resource_type, resource_id)
        action_rules = [r for r in rules if r["action"] == action]

        best_match = None
        best_len = -1
        for rule in action_rules:
            rp = rule["folder_path"]
            if rp == "":
                matched = True
            elif folder_path == rp:
                matched = True
            elif folder_path.startswith(rp + "/"):
                matched = True
            else:
                matched = False

            if matched and len(rp) > best_len:
                best_len = len(rp)
                best_match = rule

        if best_match is not None:
            return best_match["access"] == "allow"

        return DEFAULTS.get(resource_type, {}).get(action, False)

    def can_read(self, character_id: str, resource_type: str,
                 resource_id: str, folder_path: str = "") -> bool:
        return self._check(character_id, resource_type, resource_id, folder_path, "read")

    def can_write(self, character_id: str, resource_type: str,
                  resource_id: str, folder_path: str = "") -> bool:
        return self._check(character_id, resource_type, resource_id, folder_path, "write")

    def set_permission(self, character_id: str, resource_type: str,
                       resource_id: str, folder_path: str,
                       action: str, access: str) -> None:
        """设置 ACL 规则（upsert）"""
        if access not in ("allow", "deny"):
            raise ValueError(f"access must be 'allow' or 'deny', got '{access}'")
        if action not in ("read", "write"):
            raise ValueError(f"action must be 'read' or 'write', got '{action}'")

        with _write_lock:
            conn = _get_conn()
            conn.execute(
                """INSERT INTO acl_rules (character_id, resource_type, resource_id, folder_path, action, access)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(character_id, resource_type, resource_id, folder_path, action)
                   DO UPDATE SET access=excluded.access""",
                (character_id, resource_type, resource_id, folder_path, action, access),
            )
            conn.commit()
        self._invalidate(character_id, resource_type, resource_id)
