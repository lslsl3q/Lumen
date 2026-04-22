"""
Lumen - 知识库存储服务
管理源文件、切分、向量化、搜索
单个 TriviumDB 实例 + category 字段区分不同来源
"""

import json
import os
import time
import random
import string
import logging
import threading
from typing import Optional, List, Dict

import triviumdb

from lumen.config import (
    EMBEDDING_DIMENSIONS,
    KNOWLEDGE_DB_PATH,
    KNOWLEDGE_CHUNK_SIZE,
    KNOWLEDGE_CHUNK_OVERLAP,
    KNOWLEDGE_SOURCE_DIR,
)
from lumen.services import embedding
from lumen.services.chunker import chunk_text

logger = logging.getLogger(__name__)

# ── TriviumDB 单例（独立于 memory.tdb）──
_db: Optional[triviumdb.TriviumDB] = None
_db_lock = threading.Lock()

# ── Registry 缓存 ──
_registry_cache: Optional[Dict[str, Dict]] = None
_registry_lock = threading.Lock()

REGISTRY_PATH = os.path.join(KNOWLEDGE_SOURCE_DIR, "_registry.json")


def _get_db() -> triviumdb.TriviumDB:
    """获取 knowledge.tdb 实例（单例，线程安全）"""
    global _db
    if _db is None:
        with _db_lock:
            if _db is None:
                os.makedirs(os.path.dirname(KNOWLEDGE_DB_PATH), exist_ok=True)
                _db = triviumdb.TriviumDB(KNOWLEDGE_DB_PATH, dim=EMBEDDING_DIMENSIONS)
                logger.info(f"知识库 TriviumDB 已打开: {KNOWLEDGE_DB_PATH}")
    return _db


def _load_registry() -> Dict[str, Dict]:
    """加载 registry.json（带内存缓存）"""
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                _registry_cache = json.load(f)
        except (json.JSONDecodeError, IOError):
            _registry_cache = {}
    else:
        _registry_cache = {}
    return _registry_cache


def _save_registry(registry: Dict[str, Dict]) -> None:
    """保存 registry.json 并刷新缓存"""
    global _registry_cache
    os.makedirs(KNOWLEDGE_SOURCE_DIR, exist_ok=True)
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    _registry_cache = registry


def _clear_registry_cache() -> None:
    global _registry_cache
    _registry_cache = None


def _generate_file_id() -> str:
    """生成文件ID: kb{timestamp6}{random3}"""
    timestamp = str(int(time.time()))[-6:]
    random_chars = "".join(random.choices(string.ascii_lowercase, k=3))
    return f"kb{timestamp}{random_chars}"


# ── 公开 API ──


def list_files(category: str = None) -> List[Dict]:
    """列出所有已导入的文件元数据，可按 category 过滤"""
    registry = _load_registry()
    entries = list(registry.values())
    if category:
        entries = [e for e in entries if e.get("category") == category]
    return sorted(entries, key=lambda e: e.get("created_at", ""), reverse=True)


def get_file(file_id: str) -> Dict:
    """获取单个文件的元数据"""
    registry = _load_registry()
    if file_id not in registry:
        raise FileNotFoundError(f"文件不存在: {file_id}")
    return registry[file_id]


async def import_file(
    filename: str,
    content: str,
    category: str = "imports",
    subdir: str = "",
) -> Dict:
    """导入文件: 保存源文件 → 切分 → 批量嵌入 → 存入 knowledge.tdb

    Args:
        filename: 原始文件名
        content: 文件正文
        category: 分类（imports/notes/rpg/public）
        subdir: 子目录（如 "世界观/地理"）

    Returns:
        文件元数据 dict
    """
    fid = _generate_file_id()
    now = time.strftime("%Y-%m-%dT%H:%M:%S")

    # 1. 保存源文件（保留目录结构）
    if subdir:
        source_dir = os.path.join(KNOWLEDGE_SOURCE_DIR, category, subdir)
    else:
        source_dir = os.path.join(KNOWLEDGE_SOURCE_DIR, category)
    os.makedirs(source_dir, exist_ok=True)
    source_path = os.path.join(source_dir, filename)
    with open(source_path, "w", encoding="utf-8") as f:
        f.write(content)

    # 2. 切分
    chunks = chunk_text(content, KNOWLEDGE_CHUNK_SIZE, KNOWLEDGE_CHUNK_OVERLAP)
    if not chunks:
        chunks = [content] if content.strip() else []

    if not chunks:
        # 空内容，只保存源文件不向量化
        meta = _build_meta(fid, filename, category, subdir, 0, len(content), now)
        _update_registry(fid, meta)
        logger.info(f"知识库导入（空内容）: {fid} ({filename})")
        return meta

    # 3. 批量嵌入
    vectors = await embedding.encode_batch(chunks)
    if not vectors:
        raise RuntimeError("Embedding 服务不可用，无法向量化")

    # 4. 存入 TriviumDB
    db = _get_db()
    rel_path = os.path.join(category, subdir, filename) if subdir else os.path.join(category, filename)
    rel_path = rel_path.replace("\\", "/")

    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        payload = {
            "file_id": fid,
            "source_path": rel_path,
            "filename": filename,
            "category": category,
            "chunk_index": i,
            "content": chunk,
            "tags": [],
        }
        db.insert(vector, payload)
    db.flush()

    # 5. 更新 registry
    meta = _build_meta(fid, filename, category, subdir, len(chunks), len(content), now)
    _update_registry(fid, meta)

    logger.info(f"知识库导入: {fid} ({filename}), {len(chunks)} chunks")
    return meta


async def search(
    query: str,
    top_k: int = 5,
    min_score: float = 0.3,
    category: str = None,
) -> List[Dict]:
    """语义搜索: embed(query) → cosine search → 返回 top-K chunks"""
    query_vector = await embedding.encode(query)
    if not query_vector:
        return []

    db = _get_db()
    # 多取一些再过滤
    results = db.search(query_vector, top_k=top_k * 3, min_score=min_score)

    hits = []
    seen = set()
    for hit in results:
        payload = hit.payload if hasattr(hit, "payload") else {}

        # 按 category 过滤
        if category and payload.get("category") != category:
            continue

        # 去重（同文件同 chunk_index）
        key = (payload.get("file_id", ""), payload.get("chunk_index", 0))
        if key in seen:
            continue
        seen.add(key)

        hits.append({
            "chunk_id": hit.id if hasattr(hit, "id") else 0,
            "file_id": payload.get("file_id", ""),
            "source_path": payload.get("source_path", ""),
            "filename": payload.get("filename", ""),
            "content": payload.get("content", ""),
            "score": hit.score if hasattr(hit, "score") else 0.0,
            "chunk_index": payload.get("chunk_index", 0),
        })
        if len(hits) >= top_k:
            break

    return hits


async def delete_file(file_id: str) -> None:
    """删除文件：删向量 + 删源文件 + 更新 registry"""
    registry = _load_registry()
    if file_id not in registry:
        raise FileNotFoundError(f"文件不存在: {file_id}")

    meta = registry[file_id]

    # 1. 删向量
    db = _get_db()
    nodes = db.filter_where({"file_id": file_id})
    count = 0
    for node in nodes:
        db.delete(node.id)
        count += 1
    if count:
        db.flush()

    # 2. 删源文件
    source_path = meta.get("source_path", "")
    if source_path:
        full_path = os.path.join(KNOWLEDGE_SOURCE_DIR, source_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            # 清理空目录
            _cleanup_empty_dirs(os.path.dirname(full_path), KNOWLEDGE_SOURCE_DIR)

    # 3. 更新 registry
    del registry[file_id]
    _save_registry(registry)

    logger.info(f"知识库删除: {file_id} ({meta.get('filename', '')}), 清理 {count} 条向量")


def close():
    """关闭 TriviumDB"""
    global _db
    if _db is not None:
        _db.flush()
        _db = None
        logger.info("知识库 TriviumDB 已关闭")


# ── 内部工具 ──


def _build_meta(
    fid: str, filename: str, category: str, subdir: str,
    chunk_count: int, char_count: int, now: str,
) -> Dict:
    rel_path = os.path.join(category, subdir, filename) if subdir else os.path.join(category, filename)
    rel_path = rel_path.replace("\\", "/")
    ext = os.path.splitext(filename)[1].lstrip(".") or "txt"
    return {
        "id": fid,
        "source_path": rel_path,
        "filename": filename,
        "file_type": ext,
        "category": category,
        "chunk_count": chunk_count,
        "char_count": char_count,
        "tags": [],
        "created_at": now,
        "updated_at": now,
    }


def _update_registry(fid: str, meta: Dict) -> None:
    with _registry_lock:
        registry = _load_registry()
        registry[fid] = meta
        _save_registry(registry)


def _cleanup_empty_dirs(current: str, stop_at: str) -> None:
    """递归清理空目录（到 stop_at 为止）"""
    while current and current != stop_at and os.path.isdir(current):
        try:
            if not os.listdir(current):
                os.rmdir(current)
                current = os.path.dirname(current)
            else:
                break
        except OSError:
            break
