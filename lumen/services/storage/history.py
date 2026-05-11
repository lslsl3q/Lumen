"""
Lumen - 对话历史存储
用 SQLite 存储聊天记录，重启不丢失
以后记忆系统可以从这里搜索历史对话

纯同步层 — API 路由通过 asyncio.to_thread() 调用，避免阻塞事件循环
"""

import sqlite3
import os
import json
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List

from lumen.types.messages import Message
from lumen.services.types import SessionInfo
from lumen.config import HISTORY_DB

logger = logging.getLogger(__name__)

DB_PATH = HISTORY_DB

# 线程局部存储：每个线程独立连接，避免多线程并发写冲突
_local = threading.local()
# 写操作锁：确保同一时刻只有一个线程在写
_write_lock = threading.Lock()


def _get_conn():
    """获取数据库连接（每个线程独立连接，避免 SQLite 线程安全问题）"""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn


def close_conn():
    """关闭当前线程的数据库连接（程序退出时调用）"""
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None


def _migrate_add_metadata():
    """数据库迁移：给 messages 表添加 metadata 字段"""
    conn = _get_conn()
    cursor = conn.cursor()

    # 检查 metadata 字段是否存在
    cursor.execute("PRAGMA table_info(messages)")
    columns = [row["name"] for row in cursor.fetchall()]

    if "metadata" not in columns:
        logger.info("数据库迁移: 添加 metadata 字段到 messages 表...")
        cursor.execute("ALTER TABLE messages ADD COLUMN metadata TEXT")
        conn.commit()
        logger.info("数据库迁移: 完成")


def _migrate_add_authors_note():
    """数据库迁移：给 sessions 表添加 authors_note 字段"""
    conn = _get_conn()
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(sessions)")
    columns = [row["name"] for row in cursor.fetchall()]

    if "authors_note" not in columns:
        logger.info("数据库迁移: 添加 authors_note 字段到 sessions 表...")
        cursor.execute("ALTER TABLE sessions ADD COLUMN authors_note TEXT DEFAULT NULL")
        conn.commit()
        logger.info("数据库迁移: 完成")


def _migrate_add_title():
    """数据库迁移：给 sessions 表添加 title 字段"""
    conn = _get_conn()
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(sessions)")
    columns = [row["name"] for row in cursor.fetchall()]

    if "title" not in columns:
        logger.info("数据库迁移: 添加 title 字段到 sessions 表...")
        cursor.execute("ALTER TABLE sessions ADD COLUMN title TEXT DEFAULT NULL")
        conn.commit()
        logger.info("数据库迁移: 完成")


def _migrate_add_channels():
    """数据库迁移：创建 channels 表 + messages 加 channel_id 字段（T26）"""
    conn = _get_conn()
    cursor = conn.cursor()

    # 1. 创建 channels 表
    existing = cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='channels'"
    ).fetchone()
    if not existing:
        logger.info("数据库迁移: 创建 channels 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS channels (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                type        TEXT NOT NULL DEFAULT 'chat',
                description TEXT DEFAULT '',
                "order"     INTEGER DEFAULT 0,
                "group"     TEXT DEFAULT 'base',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        conn.commit()
        logger.info("数据库迁移: channels 表创建完成")

    # 2. messages 加 channel_id 列
    cursor.execute("PRAGMA table_info(messages)")
    columns = [row["name"] for row in cursor.fetchall()]

    if "channel_id" not in columns:
        logger.info("数据库迁移: 添加 channel_id 字段到 messages 表...")
        cursor.execute("ALTER TABLE messages ADD COLUMN channel_id TEXT DEFAULT NULL")
        conn.commit()
        logger.info("数据库迁移: 完成")


def _init_fts5(conn):
    """初始化 FTS5 全文索引（unicode61 + jieba 分词，支持中文 BM25）"""
    cursor = conn.cursor()

    # 检查 FTS5 表是否已存在
    existing = cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'"
    ).fetchone()

    if not existing:
        logger.info("初始化 FTS5 全文索引（unicode61 + jieba 分词）...")
        cursor.execute("""
            CREATE VIRTUAL TABLE messages_fts USING fts5(
                content,
                tokenize='unicode61'
            )
        """)
        # 用现有数据填充索引（jieba 分词后存入）
        _rebuild_fts5_index(cursor)
        conn.commit()
        logger.info("FTS5 全文索引初始化完成")


def _rebuild_fts5_index(cursor):
    """重建 FTS5 索引：对每条消息做 jieba 分词后存入"""
    import jieba
    rows = cursor.execute("SELECT id, content FROM messages WHERE role != 'system'").fetchall()
    for row in rows:
        msg_id = row["id"]
        content = row["content"]
        if not content or len(content) < 5:
            continue
        # jieba 分词，空格连接
        tokens = " ".join(jieba.cut(content))
        cursor.execute("INSERT INTO messages_fts(rowid, content) VALUES(?, ?)", (msg_id, tokens))


# ── 消息搜索（供 memory 系统调用） ──

# 工具消息标记，搜索结果中跳过
_TOOL_MARKERS = (
    '"tool":', '"tool" :', '"type": "tool_call', '"type":"tool_call',
    '"calls":', '"calls" :', '{"success":', '{"error_code":',
    '<tool_result', '<<<[TOOL_REQUEST]',
)


def search_messages_bm25(
    keywords: list[str],
    character_id: str,
    limit: int = 10,
    exclude_session_id: str = "",
) -> list[dict]:
    """FTS5 BM25 全文搜索（jieba 分词，支持中文）

    Args:
        keywords: 搜索关键词列表（jieba 提取的）
        character_id: 限定角色
        limit: 最多返回条数
        exclude_session_id: 排除当前会话的消息

    Returns:
        [{"id", "role", "content", "session_id", "created_at", "bm25_score"}, ...]
    """
    if not keywords:
        return []

    query = " OR ".join(f'"{kw}"' for kw in keywords)

    conn = _get_conn()
    try:
        rows = conn.execute("""
            SELECT m.id, m.role, m.content, m.session_id, m.created_at,
                   bm25(messages_fts) AS score
            FROM messages_fts f
            JOIN messages m ON m.id = f.rowid
            JOIN sessions s ON m.session_id = s.id
            WHERE messages_fts MATCH ?
              AND s.character_id = ?
              AND m.role != 'system'
              AND (? = '' OR m.session_id != ?)
            ORDER BY score
            LIMIT ?
        """, (query, character_id, exclude_session_id, exclude_session_id, limit)).fetchall()
    except Exception as e:
        logger.warning(f"FTS5 搜索失败: {e}")
        return []

    results = []
    for row in rows:
        content = row["content"]
        if not content or len(content) < 5:
            continue
        if any(marker in content for marker in _TOOL_MARKERS):
            continue
        results.append({
            "id": row["id"],
            "role": row["role"],
            "content": content,
            "session_id": row["session_id"],
            "created_at": row["created_at"],
            "bm25_score": row["score"],
        })
    return results


def search_messages(
    keyword: str,
    character_id: str,
    limit: int = 10,
    exclude_session_id: str = "",
) -> list[dict]:
    """跨会话搜索消息（LIKE 模糊匹配，jieba 回退路径）

    Args:
        keyword: 搜索关键词
        character_id: 限定角色的会话
        limit: 最多返回条数
        exclude_session_id: 排除当前会话的消息

    Returns:
        [{"id", "role", "content", "session_id", "created_at"}, ...]
    """
    if not keyword or not keyword.strip():
        return []

    conn = _get_conn()
    escaped = keyword.replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    rows = conn.execute("""
        SELECT m.id, m.role, m.content, m.session_id, m.created_at
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE s.character_id = ?
          AND m.role != 'system'
          AND m.content LIKE ? ESCAPE '\\'
          AND (? = '' OR m.session_id != ?)
        ORDER BY m.id DESC
        LIMIT ?
    """, (character_id, pattern, exclude_session_id, exclude_session_id, limit)).fetchall()

    results = []
    for row in rows:
        content = row["content"]
        if not content or len(content) < 5:
            continue
        if any(marker in content for marker in _TOOL_MARKERS):
            continue
        results.append({
            "id": row["id"],
            "role": row["role"],
            "content": content,
            "session_id": row["session_id"],
            "created_at": row["created_at"],
        })
    return results


def get_message_context(session_id: str, center_id: int, window: int = 2) -> list[dict[str, str]]:
    """获取某条消息的前后上下文

    Args:
        session_id: 会话 ID
        center_id: 中心消息 ID
        window: 前后各取几条（默认 2）

    Returns:
        [{"role", "content"}, ...] 上下文消息列表
    """
    conn = _get_conn()
    rows = conn.execute("""
        SELECT role, content FROM messages
        WHERE session_id = ?
          AND role != 'system'
          AND id BETWEEN ? AND ?
        ORDER BY id
    """, (session_id, center_id - window, center_id + window)).fetchall()

    return [{"role": row["role"], "content": row["content"]} for row in rows]




def _init_db():
    """初始化数据库，创建表（只在第一次运行时执行）"""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT PRIMARY KEY,
            character_id TEXT,
            created_at   TEXT,
            updated_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT,
            role        TEXT,
            content     TEXT,
            metadata    TEXT,
            created_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS summaries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT,
            character_id TEXT,
            summary      TEXT,
            created_at   TEXT
        );
    """)

    # 数据库迁移
    _migrate_add_metadata()
    _migrate_add_authors_note()
    _migrate_add_title()
    _migrate_add_channels()   # T26: channels 表 + channel_id
    _init_fts5(conn)
    # active_memories / knowledge_chunks / graph_edge_meta 表
    # 由各自模块在 import 时自动创建（lumen.services.memory.active_store 等）


# 程序启动时自动初始化数据库
_init_db()


# ========================================
# Channel CRUD（T26: Session→Channel 迁移）
# ========================================

def create_channel(name: str, channel_type: str = "chat", description: str = "",
                   group_name: str = "base") -> str:
    """创建新频道，返回 channel_id"""
    import uuid
    channel_id = f"ch-{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()
    with _write_lock:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO channels (id, name, type, description, "order", "group", created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (channel_id, name, channel_type, description, 0, group_name, now, now),
        )
        conn.commit()
    logger.info(f"频道已创建: {channel_id} ({name}, type={channel_type})")
    return channel_id


def list_channels(limit: int = 50) -> list[dict]:
    """列出所有频道，按 order ASC + created_at DESC"""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT id, name, type, description, "order", "group", created_at, updated_at
           FROM channels ORDER BY "order" ASC, created_at DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]


def delete_channel(channel_id: str) -> bool:
    """删除频道，同时将关联消息的 channel_id 设为 NULL"""
    with _write_lock:
        conn = _get_conn()
        # 解除消息关联（不删消息）
        conn.execute(
            "UPDATE messages SET channel_id = NULL WHERE channel_id = ?",
            (channel_id,),
        )
        cursor = conn.execute("DELETE FROM channels WHERE id = ?", (channel_id,))
        conn.commit()
        if cursor.rowcount > 0:
            logger.info(f"频道已删除: {channel_id}")
            return True
    return False


def get_channel_messages(channel_id: str, limit: int = 50,
                         since_id: int = 0) -> list[dict]:
    """获取频道的消息列表（按 id ASC）

    Args:
        channel_id: 频道 ID
        limit: 最多返回条数
        since_id: 断线重连补拉时用，只返回 id > since_id 的消息
    """
    conn = _get_conn()
    if since_id > 0:
        rows = conn.execute(
            """SELECT id, role, content, metadata, channel_id, session_id, created_at
               FROM messages
               WHERE channel_id = ? AND id > ?
               ORDER BY id ASC LIMIT ?""",
            (channel_id, since_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT id, role, content, metadata, channel_id, session_id, created_at
               FROM messages
               WHERE channel_id = ?
               ORDER BY id ASC LIMIT ?""",
            (channel_id, limit),
        ).fetchall()
    return [_row_to_message_dict(row) for row in rows]


def save_message_to_channel(channel_id: str, session_id: str, role: str,
                            content: str, metadata: Optional[Dict[str, Any]] = None) -> int:
    """保存消息到频道（同时关联频道和会话）

    Returns:
        消息 ID
    """
    now = datetime.now().isoformat()
    metadata_json = json.dumps(metadata, ensure_ascii=False) if metadata else None

    with _write_lock:
        conn = _get_conn()
        cursor = conn.execute(
            """INSERT INTO messages (session_id, channel_id, role, content, metadata, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, channel_id, role, content, metadata_json, now),
        )
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        conn.commit()
        msg_id = cursor.lastrowid or 0
        # 同步 FTS5
        if role != "system" and content and len(content) >= 5:
            try:
                import jieba
                tokens = " ".join(jieba.cut(content))
                conn.execute(
                    "INSERT INTO messages_fts(rowid, content) VALUES(?, ?)",
                    (msg_id, tokens),
                )
                conn.commit()
            except Exception:
                pass
        return msg_id


def _row_to_message_dict(row) -> dict:
    """将 SQLite Row 转为消息 dict（统一解析 metadata）"""
    msg = {"id": row["id"], "role": row["role"], "content": row["content"]}
    if row["channel_id"]:
        msg["channel_id"] = row["channel_id"]
    if row["session_id"]:
        msg["session_id"] = row["session_id"]
    if row["created_at"]:
        msg["created_at"] = row["created_at"]
    if row["metadata"]:
        try:
            msg["metadata"] = json.loads(row["metadata"])
        except json.JSONDecodeError:
            msg["metadata"] = {"type": "normal", "folded": False}
    else:
        msg["metadata"] = {"type": "normal", "folded": False}
    return msg


# ========================================
# Session 管理
# ========================================


def new_session(character_id: str = "default") -> str:
    """创建新会话，返回会话ID"""
    session_id = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    now = datetime.now().isoformat()
    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO sessions (id, character_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (session_id, character_id, now, now),
        )
        conn.commit()
    return session_id


def save_message(session_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> int:
    """保存一条消息到数据库

    Args:
        session_id: 会话 ID
        role: 消息角色（user/assistant/system）
        content: 消息内容
        metadata: 消息元数据（可选），会转换为 JSON 存储

    Returns:
        消息 ID（用于后续向量存储）
    """
    now = datetime.now().isoformat()
    metadata_json = json.dumps(metadata, ensure_ascii=False) if metadata else None

    with _write_lock:
        conn = _get_conn()
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, role, content, metadata_json, now),
        )
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        conn.commit()
        msg_id = cursor.lastrowid or 0
        # 同步 FTS5 索引（jieba 分词后存入）
        if role != "system" and content and len(content) >= 5:
            try:
                import jieba
                tokens = " ".join(jieba.cut(content))
                conn.execute(
                    "INSERT INTO messages_fts(rowid, content) VALUES(?, ?)",
                    (msg_id, tokens),
                )
                conn.commit()
            except Exception:
                pass
        return msg_id


def update_message(msg_id: int, content: str) -> bool:
    """更新消息内容并重建 FTS5 索引"""
    with _write_lock:
        conn = _get_conn()
        cursor = conn.execute(
            "UPDATE messages SET content = ? WHERE id = ?",
            (content, msg_id),
        )
        if cursor.rowcount == 0:
            return False
        # 重建 FTS5 索引
        try:
            conn.execute("DELETE FROM messages_fts WHERE rowid = ?", (msg_id,))
            if content and len(content) >= 5:
                import jieba
                tokens = " ".join(jieba.cut(content))
                conn.execute(
                    "INSERT INTO messages_fts(rowid, content) VALUES(?, ?)",
                    (msg_id, tokens),
                )
        except Exception:
            pass
        conn.commit()
        return True


def delete_message(msg_id: int) -> bool:
    """删除消息及其 FTS5 索引"""
    with _write_lock:
        conn = _get_conn()
        try:
            conn.execute("DELETE FROM messages_fts WHERE rowid = ?", (msg_id,))
        except Exception:
            pass
        cursor = conn.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
        conn.commit()
        return cursor.rowcount > 0


def delete_messages_from(session_id: str, from_id: int) -> int:
    """删除指定 ID 及之后的所有消息（含 FTS 索引），返回删除数量"""
    with _write_lock:
        conn = _get_conn()
        try:
            conn.execute(
                "DELETE FROM messages_fts WHERE rowid IN "
                "(SELECT id FROM messages WHERE session_id = ? AND id >= ?)",
                (session_id, from_id),
            )
        except Exception:
            pass
        cursor = conn.execute(
            "DELETE FROM messages WHERE session_id = ? AND id >= ?",
            (session_id, from_id),
        )
        conn.commit()
        return cursor.rowcount


def copy_messages_to(src_session_id: str, dst_session_id: str, up_to_id: int):
    """复制源会话中指定 ID 及之前的所有消息到目标会话"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT role, content, metadata FROM messages "
        "WHERE session_id = ? AND id <= ? ORDER BY id",
        (src_session_id, up_to_id),
    ).fetchall()

    with _write_lock:
        conn_exec = _get_conn()
        for role, content, metadata in rows:
            metadata_json = json.dumps(metadata, ensure_ascii=False) if metadata else None
            conn_exec.execute(
                "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                (dst_session_id, role, content, metadata_json, datetime.now().isoformat()),
            )
        conn_exec.commit()


def load_session(session_id: str) -> list[Message]:
    """加载某个会话的所有消息，返回 messages 列表

    Args:
        session_id: 会话 ID

    Returns:
        消息列表，格式：[{"role": ..., "content": ..., "metadata": ...}, ...]
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, role, content, metadata FROM messages WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()

    messages = []
    for row in rows:
        msg = {"id": row["id"], "role": row["role"], "content": row["content"]}
        # 解析 metadata（如果有）
        if row["metadata"]:
            try:
                msg["metadata"] = json.loads(row["metadata"])
            except json.JSONDecodeError:
                msg["metadata"] = {"type": "normal", "folded": False}
        else:
            msg["metadata"] = {"type": "normal", "folded": False}
        messages.append(msg)

    return messages


def list_sessions(limit: int = 20, character_id: str | None = None) -> list[SessionInfo]:
    """列出最近的会话，按最后更新时间倒序"""
    conn = _get_conn()
    if character_id:
        rows = conn.execute(
            "SELECT id, character_id, created_at, title FROM sessions WHERE character_id = ? ORDER BY updated_at DESC LIMIT ?",
            (character_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, character_id, created_at, title FROM sessions ORDER BY updated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {"session_id": row["id"], "character_id": row["character_id"], "created_at": row["created_at"], "title": row["title"]}
        for row in rows
    ]


def get_session_info(session_id: str) -> Optional[Dict[str, Any]]:
    """获取单个会话的基本信息（从数据库查询，不依赖内存）"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT character_id, title FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    if row:
        return {"session_id": session_id, "character_id": row["character_id"], "title": row["title"]}
    return None


def update_session_title(session_id: str, title: str):
    """更新会话标题"""
    with _write_lock:
        conn = _get_conn()
        conn.execute("UPDATE sessions SET title = ? WHERE id = ?", (title, session_id))
        conn.commit()
    logger.info(f"会话标题已更新: {session_id} → {title}")


def delete_session(session_id: str):
    """删除一个会话及其所有消息、摘要、FTS5 索引和向量"""
    with _write_lock:
        conn = _get_conn()
        # 收集消息 ID 并批量删除 FTS5 索引
        msg_ids = conn.execute(
            "SELECT id FROM messages WHERE session_id = ?", (session_id,)
        ).fetchall()
        if msg_ids:
            placeholders = ",".join("?" * len(msg_ids))
            try:
                conn.execute(
                    f"DELETE FROM messages_fts WHERE rowid IN ({placeholders})",
                    [row["id"] for row in msg_ids],
                )
            except Exception:
                pass
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM summaries WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()

    # 清理 TriviumDB 向量（失败不影响主流程）
    try:
        from lumen.services.search.vector_store import delete_by_session
        count = delete_by_session(session_id)
        if count:
            logger.info(f"已删除会话 {session_id} 的 {count} 条向量")
    except Exception as e:
        logger.warning(f"向量清理失败（不影响已删除的会话）: {e}")


def save_summary(session_id: str, character_id: str, summary: str):
    """保存会话摘要"""
    now = datetime.now().isoformat()
    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO summaries (session_id, character_id, summary, created_at) VALUES (?, ?, ?, ?)",
            (session_id, character_id, summary, now),
        )
        conn.commit()


def load_summaries(character_id: str, limit: int = 3) -> list:
    """读取某角色最近的 N 条摘要
    返回 [(会话ID, 摘要文本), ...]
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT session_id, summary FROM summaries WHERE character_id = ? ORDER BY id DESC LIMIT ?",
        (character_id, limit),
    ).fetchall()
    return [(row["session_id"], row["summary"]) for row in rows]


# ========================================
# Author's Note
# ========================================

def get_authors_note(session_id: str) -> Optional[Dict[str, Any]]:
    """读取会话的 Author's Note 配置

    Returns:
        解析后的 dict，或 None（无 note 或会话不存在）
    """
    conn = _get_conn()
    row = conn.execute(
        "SELECT authors_note FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()

    if row and row["authors_note"]:
        try:
            return json.loads(row["authors_note"])
        except json.JSONDecodeError:
            logger.warning(f"会话 {session_id} 的 authors_note JSON 解析失败")
            return None
    return None


def save_authors_note(session_id: str, note_json: Optional[str]):
    """写入或清除会话的 Author's Note"""
    with _write_lock:
        conn = _get_conn()
        conn.execute(
            "UPDATE sessions SET authors_note = ? WHERE id = ?",
            (note_json, session_id),
        )
        conn.commit()


# ========================================
# Compact（原子消息替换）
# ========================================

def replace_session_messages(session_id: str, messages: list[Message]):
    """原子替换会话的所有消息（compact 用）

    在显式事务中：删除旧消息 → 插入新消息。保证不会丢数据。
    """
    now = datetime.now().isoformat()
    with _write_lock:
        conn = _get_conn()
        cursor = conn.cursor()
        try:
            conn.execute("BEGIN IMMEDIATE")
            cursor.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            for msg in messages:
                metadata_json = json.dumps(msg.get("metadata"), ensure_ascii=False) if msg.get("metadata") else None
                cursor.execute(
                    "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                    (session_id, msg["role"], msg["content"], metadata_json, now),
                )
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"替换会话 {session_id} 消息失败: {e}")
            raise


