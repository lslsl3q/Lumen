"""
Lumen - 统一权限服务（纯白名单模型）

规则表只存 allow，没有 deny。
有匹配规则 = 允许，无匹配规则 = 拒绝。
前缀匹配：grant "/地理" 则 "/地理/亚洲" 自动允许。
"""

import sqlite3
import os
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

from lumen.config import PERMISSIONS_DB_PATH as DB_PATH

_local = threading.local()
_write_lock = threading.Lock()

_instance: "AccessControl" | None = None

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
        access TEXT NOT NULL DEFAULT 'allow'
    )""")
    conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_acl_unique ON acl_rules(
        character_id, resource_type, resource_id, folder_path, action
    )""")
    # 清理旧 deny 规则（从 allow/deny 混合模型迁移）
    conn.execute("DELETE FROM acl_rules WHERE access = 'deny'")
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
    """纯白名单权限服务 — 有规则即允许，无规则即拒绝"""

    def __init__(self):
        self._cache: dict[tuple[str, str, str], list[dict]] = {}

    def _cache_key(self, character_id: str, resource_type: str, resource_id: str):
        return (character_id, resource_type, resource_id)

    def _invalidate(self, character_id: str, resource_type: str, resource_id: str):
        self._cache.pop(self._cache_key(character_id, resource_type, resource_id), None)

    def _get_rules(self, character_id: str, resource_type: str, resource_id: str) -> list[dict]:
        key = self._cache_key(character_id, resource_type, resource_id)
        if key not in self._cache:
            conn = _get_conn()
            rows = conn.execute(
                "SELECT * FROM acl_rules WHERE character_id=? AND resource_type=? AND resource_id=?",
                (character_id, resource_type, resource_id),
            ).fetchall()
            self._cache[key] = [dict(r) for r in rows]
        return self._cache[key]

    @staticmethod
    def _find_best_rule(action_rules: list[dict], folder_path: str):
        """前缀匹配：找最长匹配的规则"""
        best_match = None
        best_len = -1
        for rule in action_rules:
            rp = rule["folder_path"]
            if rp == "" or folder_path == rp or folder_path.startswith(rp + "/"):
                if len(rp) > best_len:
                    best_len = len(rp)
                    best_match = rule
        return best_match

    def _check(self, character_id: str, resource_type: str,
               resource_id: str, folder_path: str, action: str) -> bool:
        rules = self._get_rules(character_id, resource_type, resource_id)
        action_rules = [r for r in rules if r["action"] == action]
        return self._find_best_rule(action_rules, folder_path) is not None

    def can_read(self, character_id: str, resource_type: str,
                 resource_id: str, folder_path: str = "") -> bool:
        return self._check(character_id, resource_type, resource_id, folder_path, "read")

    def can_write(self, character_id: str, resource_type: str,
                  resource_id: str, folder_path: str = "") -> bool:
        return self._check(character_id, resource_type, resource_id, folder_path, "write")

    def grant(self, character_id: str, resource_type: str,
              resource_id: str, folder_path: str, action: str = "read") -> None:
        """授予权限（白名单：只写 allow）"""
        if action not in ("read", "write"):
            raise ValueError(f"action must be 'read' or 'write', got '{action}'")

        with _write_lock:
            conn = _get_conn()
            conn.execute(
                """INSERT INTO acl_rules (character_id, resource_type, resource_id, folder_path, action, access)
                   VALUES (?, ?, ?, ?, ?, 'allow')
                   ON CONFLICT(character_id, resource_type, resource_id, folder_path, action)
                   DO UPDATE SET access='allow'""",
                (character_id, resource_type, resource_id, folder_path, action),
            )
            conn.commit()
            self._invalidate(character_id, resource_type, resource_id)

    def revoke(self, character_id: str, resource_type: str,
               resource_id: str, folder_path: str, action: str = "read") -> None:
        """撤销权限（删除规则 + 递归删除子路径规则）"""
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
                        resource_id: str) -> list[dict]:
        """获取角色的所有权限规则"""
        rules = self._get_rules(character_id, resource_type, resource_id)
        return [{"folder_path": r["folder_path"], "action": r["action"]}
                for r in rules]

    def batch_set(self, character_id: str, resource_type: str,
                  resource_id: str, entries: list[dict]) -> None:
        """批量设置权限（覆盖式：先清后写）"""
        for entry in entries:
            if entry["action"] not in ("read", "write"):
                raise ValueError(f"action must be 'read' or 'write', got '{entry['action']}'")

        with _write_lock:
            conn = _get_conn()
            conn.execute(
                "DELETE FROM acl_rules WHERE character_id=? AND resource_type=? AND resource_id=?",
                (character_id, resource_type, resource_id),
            )
            for entry in entries:
                conn.execute(
                    """INSERT INTO acl_rules (character_id, resource_type, resource_id, folder_path, action, access)
                       VALUES (?, ?, ?, ?, ?, 'allow')""",
                    (character_id, resource_type, resource_id,
                     entry["folder_path"], entry["action"]),
                )
            conn.commit()
            self._invalidate(character_id, resource_type, resource_id)

    def get_characters_with_access(self, resource_type: str, resource_id: str,
                                   folder_path: str, action: str) -> list[str]:
        """反查：获取某路径有显式 allow 规则的角色 ID 列表"""
        conn = _get_conn()
        rows = conn.execute(
            """SELECT DISTINCT character_id FROM acl_rules
               WHERE resource_type=? AND resource_id=? AND folder_path=? AND action=? AND access='allow'""",
            (resource_type, resource_id, folder_path, action),
        ).fetchall()
        return [r["character_id"] for r in rows]

    def batch_check(self, resource_type: str, resource_id: str,
                    folder_path: str, action: str,
                    character_ids: list[str]) -> dict:
        """批量检查：返回 {char_id: bool}"""
        result = {}
        for cid in character_ids:
            result[cid] = self._check(cid, resource_type, resource_id, folder_path, action)
        return result

    def get_allowed_folders(self, character_id: str, resource_type: str,
                            resource_id: str, all_folders: list[str]) -> list[str]:
        """展开为精确的叶子文件夹列表"""
        return [f for f in all_folders if self.can_read(
            character_id, resource_type, resource_id, f)]

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
