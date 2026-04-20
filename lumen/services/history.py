"""
Lumen - 对话历史存储
用 SQLite 存储聊天记录，重启不丢失
以后记忆系统可以从这里搜索历史对话
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

logger = logging.getLogger(__name__)

# 数据库文件路径（lumen/data/）
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "history.db")

# 线程局部存储：每个线程独立连接，避免多线程并发写冲突
_local = threading.local()
# 写操作锁：确保同一时刻只有一个线程在写
_write_lock = threading.Lock()


def _get_conn():
    """获取数据库连接（每个线程独立连接，避免 SQLite 线程安全问题）"""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(DATA_DIR, exist_ok=True)
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


def _sync_fts5_insert(message_id: int, content: str):
    """消息插入后同步 FTS5 索引"""
    try:
        conn = _get_conn()
        conn.execute("INSERT INTO messages_fts(rowid, content) VALUES(?, ?)", (message_id, content))
        conn.commit()
    except Exception as e:
        logger.debug(f"FTS5 同步失败: {e}")


def search_messages_bm25(
    keywords: list[str],
    character_id: str,
    limit: int = 10,
    exclude_session_id: str = "",
) -> list[dict]:
    """FTS5 BM25 全文搜索（trigram 分词，支持中文）

    Args:
        keywords: 搜索关键词列表（jieba 提取的）
        character_id: 限定角色
        limit: 最多返回条数
        exclude_session_id: 排除当前会话的消息

    Returns:
        [{"role", "content", "session_id", "created_at", "bm25_score"}, ...]
    """
    if not keywords:
        return []

    # trigram 模式下，用 OR 连接每个关键词
    # 每个关键词用双引号包裹，作为短语匹配
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
        logger.warning(f"FTS5 搜索失败，回退 LIKE: {e}")
        return []

    results = []
    for row in rows:
        content = row["content"]
        if not content or len(content) < 5:
            continue
        if any(marker in content for marker in [
            '"type": "tool_call', '"type":"tool_call',
            '{"success":', '{"error_code":',
            '<tool_result', '<<<[TOOL_REQUEST]',
        ]):
            continue
        results.append({
            "id": row["id"],
            "role": row["role"],
            "content": content,
            "session_id": row["session_id"],
            "created_at": row["created_at"],
            "bm25_score": -row["score"],  # bm25() 返回负值，取反变正
        })
    return results


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
    _init_fts5(conn)


# 程序启动时自动初始化数据库
_init_db()


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


def load_session(session_id: str) -> list[Message]:
    """加载某个会话的所有消息，返回 messages 列表

    Args:
        session_id: 会话 ID

    Returns:
        消息列表，格式：[{"role": ..., "content": ..., "metadata": ...}, ...]
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT role, content, metadata FROM messages WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()

    messages = []
    for row in rows:
        msg = {"role": row["role"], "content": row["content"]}
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


def list_sessions(limit: int = 20) -> list[SessionInfo]:
    """列出最近的会话，返回 [(会话ID, 角色名, 创建时间), ...]"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, character_id, created_at FROM sessions ORDER BY updated_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        {"session_id": row["id"], "character_id": row["character_id"], "created_at": row["created_at"]}
        for row in rows
    ]


def get_session_info(session_id: str) -> Optional[Dict[str, Any]]:
    """获取单个会话的基本信息（从数据库查询，不依赖内存）"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT character_id FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    if row:
        return {"session_id": session_id, "character_id": row["character_id"]}
    return None


def delete_session(session_id: str):
    """删除一个会话及其所有消息和摘要"""
    with _write_lock:
        conn = _get_conn()
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM summaries WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()


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


def search_messages(keyword: str, character_id: str, limit: int = 10, exclude_session_id: str = "") -> list:
    """跨会话搜索消息（关键词模糊匹配）

    Args:
        keyword: 搜索关键词
        character_id: 限定角色的会话
        limit: 最多返回条数
        exclude_session_id: 排除当前会话的消息

    Returns:
        [{"role": ..., "content": ..., "session_id": ..., "created_at": ...}, ...]
    """
    if not keyword or not keyword.strip():
        return []

    conn = _get_conn()
    # 转义 LIKE 通配符，防止改变匹配语义
    escaped = keyword.replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    rows = conn.execute(
        """
        SELECT m.id, m.role, m.content, m.session_id, m.created_at
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE s.character_id = ?
          AND m.role != 'system'
          AND m.content LIKE ? ESCAPE '\\'
          AND (? = '' OR m.session_id != ?)
        ORDER BY m.id DESC
        LIMIT ?
        """,
        (character_id, pattern, exclude_session_id, exclude_session_id, limit),
    ).fetchall()

    results = []
    for row in rows:
        content = row["content"]
        if not content or len(content) < 5:
            continue
        # 跳过工具调用/结果消息（避免注入无意义内容）
        if any(marker in content for marker in [
            '"type": "tool_call', '"type":"tool_call',
            '{"success":', '{"error_code":',
            '<tool_result', '<<<[TOOL_REQUEST]',
        ]):
            continue
        results.append({
            "id": row["id"],
            "role": row["role"],
            "content": content,
            "session_id": row["session_id"],
            "created_at": row["created_at"],
        })
    return results


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
