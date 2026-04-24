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


def _init_active_memories(conn):
    """初始化主动记忆表 + FTS5 索引"""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS active_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memory_id TEXT UNIQUE NOT NULL,
            character_id TEXT NOT NULL,
            content TEXT NOT NULL,
            content_display TEXT NOT NULL,
            md_path TEXT,
            tags TEXT DEFAULT '[]',
            importance INTEGER DEFAULT 3,
            category TEXT DEFAULT 'context',
            session_id TEXT,
            created_at TEXT NOT NULL
        )
    """)
    existing = cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='active_memories_fts'"
    ).fetchone()
    if not existing:
        cursor.execute("""
            CREATE VIRTUAL TABLE active_memories_fts USING fts5(
                content,
                content_display,
                tokenize='unicode61'
            )
        """)
    conn.commit()


def _init_knowledge_chunks(conn):
    """初始化知识库 chunks 表 + FTS5 索引（用于知识库 BM25 搜索）"""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT NOT NULL,
            source_path TEXT,
            filename TEXT,
            category TEXT DEFAULT 'imports',
            chunk_index INTEGER DEFAULT 0,
            content TEXT NOT NULL
        )
    """)
    existing = cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_chunks_fts'"
    ).fetchone()
    if not existing:
        cursor.execute("""
            CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
                content,
                tokenize='unicode61'
            )
        """)
    conn.commit()


def save_knowledge_chunk(
    file_id: str,
    source_path: str,
    filename: str,
    category: str,
    chunk_index: int,
    content: str,
):
    """保存知识库 chunk 到 SQLite + FTS5（jieba 分词）"""
    import jieba
    tokens = " ".join(jieba.cut(content))

    with _write_lock:
        conn = _get_conn()
        cursor = conn.execute(
            """INSERT INTO knowledge_chunks
               (file_id, source_path, filename, category, chunk_index, content)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (file_id, source_path, filename, category, chunk_index, content),
        )
        row_id = cursor.lastrowid
        try:
            conn.execute(
                "INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (?, ?)",
                (row_id, tokens),
            )
        except Exception:
            pass
        conn.commit()


def save_knowledge_chunks_batch(
    file_id: str,
    source_path: str,
    filename: str,
    category: str,
    chunks: list[str],
):
    """批量保存知识库 chunks（一次锁，多次插入）"""
    import jieba

    with _write_lock:
        conn = _get_conn()
        for i, content in enumerate(chunks):
            cursor = conn.execute(
                """INSERT INTO knowledge_chunks
                   (file_id, source_path, filename, category, chunk_index, content)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (file_id, source_path, filename, category, i, content),
            )
            row_id = cursor.lastrowid
            try:
                tokens = " ".join(jieba.cut(content))
                conn.execute(
                    "INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (?, ?)",
                    (row_id, tokens),
                )
            except Exception:
                pass
        conn.commit()


def search_knowledge_bm25(
    keywords: list[str],
    category: str = "",
    limit: int = 10,
) -> list[dict]:
    """FTS5 BM25 搜索知识库 chunks

    Args:
        keywords: jieba 提取的关键词列表
        category: 按分类过滤（空不过滤）
        limit: 最多返回条数

    Returns:
        [{"file_id", "source_path", "filename", "category", "chunk_index", "content", "bm25_score"}, ...]
    """
    if not keywords:
        return []

    query = " OR ".join(f'"{kw}"' for kw in keywords)
    conn = _get_conn()

    try:
        sql = """
            SELECT k.file_id, k.source_path, k.filename, k.category,
                   k.chunk_index, k.content, -bm25(knowledge_chunks_fts) AS score
            FROM knowledge_chunks_fts f
            JOIN knowledge_chunks k ON k.id = f.rowid
            WHERE knowledge_chunks_fts MATCH ?
        """
        params: list = [query]
        if category:
            sql += " AND k.category = ?"
            params.append(category)
        sql += " ORDER BY score DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
    except Exception as e:
        logger.warning(f"知识库 FTS5 搜索失败: {e}")
        return []

    results = []
    for row in rows:
        results.append({
            "file_id": row["file_id"],
            "source_path": row["source_path"],
            "filename": row["filename"],
            "category": row["category"],
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "bm25_score": row["score"],
        })
    return results


def delete_knowledge_chunks(file_id: str) -> int:
    """删除指定文件的所有 chunks + FTS5 索引，返回删除数量"""
    with _write_lock:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT id FROM knowledge_chunks WHERE file_id = ?", (file_id,)
        ).fetchall()
        if not rows:
            return 0
        ids = [row["id"] for row in rows]
        placeholders = ",".join("?" * len(ids))
        try:
            conn.execute(
                f"DELETE FROM knowledge_chunks_fts WHERE rowid IN ({placeholders})", ids
            )
        except Exception:
            pass
        conn.execute("DELETE FROM knowledge_chunks WHERE file_id = ?", (file_id,))
        conn.commit()
        return len(ids)


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
            '"tool":', '"tool" :',
            '"type": "tool_call', '"type":"tool_call',
            '"calls":', '"calls" :',
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
    _migrate_add_title()
    _init_fts5(conn)
    _init_active_memories(conn)
    _init_knowledge_chunks(conn)


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
        from lumen.services import vector_store
        count = vector_store.delete_by_session(session_id)
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
            '"tool":', '"tool" :',
            '"type": "tool_call', '"type":"tool_call',
            '"calls":', '"calls" :',
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


def save_active_memory(
    memory_id: str,
    character_id: str,
    content: str,
    content_display: str,
    md_path: str = "",
    tags: list[str] | None = None,
    importance: int = 3,
    category: str = "context",
    session_id: str = "",
) -> str:
    """保存主动记忆到 SQLite + FTS5

    Returns:
        memory_id
    """
    now = datetime.now().isoformat()
    tags_json = json.dumps(tags or [], ensure_ascii=False)

    with _write_lock:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO active_memories
               (memory_id, character_id, content, content_display, md_path, tags, importance, category, session_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (memory_id, character_id, content, content_display, md_path, tags_json, importance, category, session_id, now),
        )
        try:
            conn.execute(
                "INSERT INTO active_memories_fts(rowid, content, content_display) VALUES (?, ?, ?)",
                (conn.execute("SELECT last_insert_rowid()").fetchone()[0], content, content_display),
            )
        except Exception:
            pass
        conn.commit()
    return memory_id


def search_active_memories_bm25(
    query: str,
    character_id: str = "",
    limit: int = 10,
) -> list[dict]:
    """BM25 搜索主动记忆（FTS5 优先，失败回退 LIKE）

    Returns:
        [{"memory_id", "content", "content_display", "category", "importance", "tags", "bm25_score"}, ...]
    """
    if not query or not query.strip():
        return []

    conn = _get_conn()
    results = []

    # FTS5 BM25 搜索
    try:
        sql = """
            SELECT a.memory_id, a.content, a.content_display, a.category,
                   a.importance, a.tags, -bm25(active_memories_fts) AS score
            FROM active_memories_fts f
            JOIN active_memories a ON a.id = f.rowid
            WHERE active_memories_fts MATCH ?
        """
        params: list = [query]
        if character_id:
            sql += " AND a.character_id = ?"
            params.append(character_id)
        sql += " ORDER BY score DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
        for row in rows:
            results.append({
                "memory_id": row["memory_id"],
                "content": row["content"],
                "content_display": row["content_display"],
                "category": row["category"],
                "importance": row["importance"],
                "tags": json.loads(row["tags"]) if row["tags"] else [],
                "bm25_score": row["score"],
                "source": "active",
            })
    except Exception as e:
        logger.debug(f"主动记忆 FTS5 搜索失败，回退 LIKE: {e}")

    # 回退：LIKE 模糊搜索
    if not results:
        sql = """
            SELECT memory_id, content, content_display, category, importance, tags
            FROM active_memories
            WHERE content LIKE ? OR content_display LIKE ?
        """
        escaped = query.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        params = [pattern, pattern]
        if character_id:
            sql += " AND character_id = ?"
            params.append(character_id)
        sql += " LIMIT ?"
        params.append(limit)

        try:
            rows = conn.execute(sql, params).fetchall()
            for row in rows:
                results.append({
                    "memory_id": row["memory_id"],
                    "content": row["content"],
                    "content_display": row["content_display"],
                    "category": row["category"],
                    "importance": row["importance"],
                    "tags": json.loads(row["tags"]) if row["tags"] else [],
                    "bm25_score": 0.5,
                    "source": "active",
                })
        except Exception as e:
            logger.warning(f"主动记忆搜索失败: {e}")

    return results


def list_active_memories(
    character_id: str = "",
    category: str = "",
    limit: int = 50,
) -> list[dict]:
    """列出主动记忆（支持按角色和分类过滤）

    Returns:
        [{"memory_id", "content", "content_display", "category",
          "importance", "tags", "md_path", "created_at"}, ...]
    """
    conn = _get_conn()
    sql = """
        SELECT memory_id, content, content_display, category,
               importance, tags, md_path, created_at
        FROM active_memories
        WHERE 1=1
    """
    params: list = []
    if character_id:
        sql += " AND character_id = ?"
        params.append(character_id)
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    results = []
    for row in rows:
        results.append({
            "memory_id": row["memory_id"],
            "content": row["content"],
            "content_display": row["content_display"],
            "category": row["category"],
            "importance": row["importance"],
            "tags": json.loads(row["tags"]) if row["tags"] else [],
            "md_path": row["md_path"] or "",
            "created_at": row["created_at"],
        })
    return results


def delete_active_memory(memory_id: str) -> bool:
    """删除主动记忆（SQLite + FTS5）"""
    with _write_lock:
        conn = _get_conn()
        row = conn.execute("SELECT id FROM active_memories WHERE memory_id = ?", (memory_id,)).fetchone()
        if not row:
            return False
        rid = row["id"]
        conn.execute("DELETE FROM active_memories WHERE memory_id = ?", (memory_id,))
        try:
            conn.execute("DELETE FROM active_memories_fts WHERE rowid = ?", (rid,))
        except Exception:
            pass
        conn.commit()
    return True


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
