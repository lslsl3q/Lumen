"""
知识库 chunks 的 SQLite + FTS5 BM25 存储

知识库文本片段的 CRUD + 全文检索。
独立 DB 文件，不再依赖 history.py。
"""

import logging
import os
import sqlite3
import threading

from lumen.config import SEARCH_INDEX_DB

logger = logging.getLogger(__name__)

DB_PATH = SEARCH_INDEX_DB
_local = threading.local()
write_lock = threading.Lock()


def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
    return _local.conn


def close_conn():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None


def _ensure_table():
    """初始化 knowledge_chunks 表 + FTS5 索引（幂等）"""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT NOT NULL,
            source_path TEXT,
            filename TEXT,
            category TEXT DEFAULT 'imports',
            chunk_index INTEGER DEFAULT 0,
            content TEXT NOT NULL,
            kb_name TEXT NOT NULL DEFAULT 'knowledge'
        )
    """)
    # 幂等：旧表没有 kb_name 列时补加
    col_check = cursor.execute(
        "PRAGMA table_info(knowledge_chunks)"
    ).fetchall()
    col_names = [row[1] for row in col_check]
    if "kb_name" not in col_names:
        cursor.execute(
            "ALTER TABLE knowledge_chunks ADD COLUMN kb_name TEXT NOT NULL DEFAULT 'knowledge'"
        )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_kc_kb ON knowledge_chunks(kb_name)"
    )
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


def save_knowledge_chunks_batch(
    file_id: str,
    source_path: str,
    filename: str,
    category: str,
    chunks: list[str],
    kb_name: str = "knowledge",
):
    """批量保存知识库 chunks（一次锁，多次插入）"""
    import jieba

    with write_lock:
        conn = get_conn()
        for i, content in enumerate(chunks):
            cursor = conn.execute(
                """INSERT INTO knowledge_chunks
                   (file_id, source_path, filename, category, chunk_index, content, kb_name)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (file_id, source_path, filename, category, i, content, kb_name),
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
    kb_name: str = "",
) -> list[dict]:
    """FTS5 BM25 搜索知识库 chunks

    Args:
        keywords: jieba 提取的关键词列表
        category: 按分类过滤（空不过滤）
        limit: 最多返回条数
        kb_name: 按知识库名称过滤（空不过滤）

    Returns:
        [{"file_id", "source_path", "filename", "category", "chunk_index", "content", "bm25_score"}, ...]
    """
    if not keywords:
        return []

    query = " OR ".join(f'"{kw}"' for kw in keywords)
    conn = get_conn()

    try:
        sql = """
            SELECT k.file_id, k.source_path, k.filename, k.category,
                   k.chunk_index, k.content, -bm25(knowledge_chunks_fts) AS score
            FROM knowledge_chunks_fts f
            JOIN knowledge_chunks k ON k.id = f.rowid
            WHERE knowledge_chunks_fts MATCH ?
        """
        params: list = [query]
        if kb_name:
            sql += " AND k.kb_name = ?"
            params.append(kb_name)
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


def delete_knowledge_chunks(file_id: str, kb_name: str = "") -> int:
    """删除指定文件的所有 chunks + FTS5 索引，返回删除数量"""
    with write_lock:
        conn = get_conn()
        sql = "SELECT id FROM knowledge_chunks WHERE file_id = ?"
        params: list = [file_id]
        if kb_name:
            sql += " AND kb_name = ?"
            params.append(kb_name)
        rows = conn.execute(sql, params).fetchall()
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


_ensure_table()
