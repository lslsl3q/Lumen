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

from lumen.config import PERMISSIONS_DB_PATH as DB_PATH
DATA_DIR = os.path.dirname(DB_PATH)

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

    def remove_permission(self, character_id: str, resource_type: str,
                          resource_id: str, folder_path: str, action: str) -> None:
        """删除 ACL 规则，递归删除子路径"""
        with _write_lock:
            conn = _get_conn()
            conn.execute(
                """DELETE FROM acl_rules
                   WHERE character_id=? AND resource_type=? AND resource_id=?
                     AND action=? AND (folder_path=? OR folder_path LIKE ?)""",
                (character_id, resource_type, resource_id, action,
                 folder_path, folder_path + "/%"),
            )
            conn.commit()
        self._invalidate(character_id, resource_type, resource_id)

    def get_permissions(self, character_id: str, resource_type: str,
                        resource_id: str) -> List[dict]:
        """获取角色的所有 ACL 规则"""
        rules = self._get_rules(character_id, resource_type, resource_id)
        return [{"folder_path": r["folder_path"], "action": r["action"],
                 "access": r["access"]}
                for r in rules]

    def batch_set_permissions(self, character_id: str, resource_type: str,
                              resource_id: str, entries: List[dict]) -> None:
        """批量设置权限"""
        with _write_lock:
            conn = _get_conn()
            conn.execute(
                "DELETE FROM acl_rules WHERE character_id=? AND resource_type=? AND resource_id=?",
                (character_id, resource_type, resource_id),
            )
            for entry in entries:
                conn.execute(
                    """INSERT INTO acl_rules (character_id, resource_type, resource_id, folder_path, action, access)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (character_id, resource_type, resource_id,
                     entry["folder_path"], entry["action"], entry["access"]),
                )
            conn.commit()
        self._invalidate(character_id, resource_type, resource_id)

    def get_characters_with_access(self, resource_type: str, resource_id: str,
                                   folder_path: str, action: str) -> List[str]:
        """反查：获取某路径有权限的角色 ID 列表"""
        conn = _get_conn()
        rows = conn.execute(
            """SELECT DISTINCT character_id FROM acl_rules
               WHERE resource_type=? AND resource_id=? AND folder_path=? AND action=? AND access='allow'""",
            (resource_type, resource_id, folder_path, action),
        ).fetchall()
        return [r["character_id"] for r in rows]

    def get_read_scope(self, character_id: str, resource_type: str,
                       resource_id: str) -> Tuple[List[str], List[str]]:
        """获取允许和拒绝的文件夹路径列表（供检索管道用）"""
        rules = self._get_rules(character_id, resource_type, resource_id)
        read_rules = [r for r in rules if r["action"] == "read"]

        allowed = [r["folder_path"] for r in read_rules if r["access"] == "allow"]
        denied = [r["folder_path"] for r in read_rules if r["access"] == "deny"]
        return allowed, denied

    def rename_path(self, resource_type: str, resource_id: str,
                    old_path: str, new_path: str) -> None:
        """批量更新 folder_path 前缀（文件夹重命名时调用）"""
        with _write_lock:
            conn = _get_conn()
            rows = conn.execute(
                """SELECT id, folder_path FROM acl_rules
                   WHERE resource_type=? AND resource_id=?
                     AND (folder_path=? OR folder_path LIKE ?)""",
                (resource_type, resource_id, old_path, old_path + "/%"),
            ).fetchall()

            for row in rows:
                new_folder = new_path + row["folder_path"][len(old_path):]
                conn.execute(
                    "UPDATE acl_rules SET folder_path=? WHERE id=?",
                    (new_folder, row["id"]),
                )
            conn.commit()
        self._cache.clear()
