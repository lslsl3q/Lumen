"""
Lumen - 记忆缓冲区服务
临时存储 + 小模型向量检索 + 批量整理后写入正式库

两个向量空间：
  buffer.tdb    → 本地小模型（与 knowledge_sentences 同模型）
  knowledge.tdb → 大模型（API 或高质量模型）
维度不同，不互相搬运，各自独立检索
"""

import time
import logging
import threading
from typing import Optional

import triviumdb

from lumen.config import (
    BUFFER_DB_PATH,
    BUFFER_AUTO_THRESHOLD,
    BUFFER_MAX_AGE_HOURS,
)
from lumen.services.embedding import get_service as get_embedding_service

logger = logging.getLogger(__name__)

_db: Optional[triviumdb.TriviumDB] = None
_db_lock = threading.Lock()


def _get_db() -> triviumdb.TriviumDB:
    """获取 buffer.tdb 实例（单例，线程安全）"""
    global _db
    if _db is None:
        with _db_lock:
            if _db is None:
                import os
                os.makedirs(os.path.dirname(BUFFER_DB_PATH), exist_ok=True)
                dim = _get_buffer_dimensions()
                _db = triviumdb.TriviumDB(BUFFER_DB_PATH, dim=dim)
                logger.info(f"缓冲区 TriviumDB 已打开: {BUFFER_DB_PATH} (维度: {dim})")
    return _db


def _get_buffer_dimensions() -> int:
    """获取缓冲区嵌入维度（与 knowledge_sentences 同模型）"""
    from lumen.services.embedding import get_dimensions
    dim = get_dimensions("buffer")
    if dim > 0:
        return dim
    return 512  # gte-small-zh fallback


def is_enabled() -> bool:
    """缓冲区是否开启（运行时配置，持久化到 runtime_config.json）"""
    from lumen.services.runtime_config import get
    return get("buffer_enabled", False)


def has_data() -> bool:
    """buffer.tdb 是否存在且有数据（用于检索决策，不受开关影响）"""
    import os
    if not os.path.exists(BUFFER_DB_PATH):
        return False
    try:
        db = _get_db()
        ids = db.all_node_ids()
        for _ in ids:
            return True
        return False
    except Exception:
        return False


async def add(
    content: str,
    source: str,
    session_id: str = "",
    character_id: str = "",
    keywords: list[str] | None = None,
    importance: int = 3,
    category: str = "",
    extra_payload: dict | None = None,
) -> int | None:
    """添加到缓冲区（小模型 embedding + jieba 关键词）

    Args:
        content: 原始内容
        source: 来源标识（"daily_note" / "chat"）
        session_id: 会话 ID
        character_id: 角色 ID
        keywords: jieba 提取的关键词（可选，外部提取）
        importance: 重要度 1-5
        category: 分类（context/preference/fact/decision）
        extra_payload: 额外 payload 字段

    Returns:
        TriviumDB 节点 ID，失败返回 None
    """
    if not is_enabled():
        return None

    try:
        backend = await get_embedding_service("buffer")
        if not backend:
            logger.warning("缓冲区嵌入服务不可用，跳过")
            return None

        vector = await backend.encode(content)
        if not vector:
            return None

        now_str = time.strftime("%Y-%m-%dT%H:%M:%S")

        payload = {
            "content": content[:4000],
            "source": source,
            "session_id": session_id,
            "character_id": character_id,
            "keywords": keywords or [],
            "importance": importance,
            "category": category,
            "status": "pending",
            "created_at": now_str,
        }
        if extra_payload:
            payload.update(extra_payload)

        db = _get_db()
        node_id = db.insert(vector, payload)
        db.flush()
        logger.info(f"缓冲区新增: {source} (节点 {node_id}, {len(content)} 字)")

        # 自动整理：检查 pending 是否达到阈值
        _check_auto_consolidate()

        return node_id

    except Exception as e:
        logger.error(f"缓冲区写入失败: {e}")
        return None


async def search(
    query: str,
    top_k: int = 5,
    min_score: float = 0.3,
    character_id: str = "",
) -> list[dict]:
    """搜索缓冲区（小模型向量 + jieba BM25 混合）

    返回结果标注 source="buffer"，方便前端区分来源。
    """
    if not is_enabled():
        return []

    try:
        backend = await get_embedding_service("buffer")
        if not backend:
            return []

        query_vector = await backend.encode(query)
        if not query_vector:
            return []

        db = _get_db()
        results = db.search(query_vector, top_k=top_k * 2, min_score=min_score)

        hits = []
        for hit in results:
            payload = hit.payload if hasattr(hit, "payload") else {}
            if character_id and payload.get("character_id") != character_id:
                continue
            if payload.get("status") == "discarded":
                continue

            hits.append({
                "id": hit.id if hasattr(hit, "id") else None,
                "content": payload.get("content", ""),
                "source": "buffer",
                "buffer_source": payload.get("source", ""),
                "session_id": payload.get("session_id", ""),
                "character_id": payload.get("character_id", ""),
                "keywords": payload.get("keywords", []),
                "importance": payload.get("importance", 3),
                "category": payload.get("category", ""),
                "status": payload.get("status", "pending"),
                "created_at": payload.get("created_at", ""),
                "score": hit.score if hasattr(hit, "score") else 0.0,
            })
            if len(hits) >= top_k:
                break

        return hits

    except Exception as e:
        logger.error(f"缓冲区搜索失败: {e}")
        return []


def list_items(
    status: str = "pending",
    limit: int = 50,
    offset: int = 0,
    character_id: str = "",
) -> list[dict]:
    """列出缓冲区条目"""
    if not is_enabled():
        return []

    try:
        db = _get_db()
        # 用 all_node_ids + get 逐条读取（filter_where({}) 不可靠）
        node_ids = db.all_node_ids()
        items = []
        for nid in node_ids:
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if status and payload.get("status") != status:
                continue
            if character_id and payload.get("character_id") != character_id:
                continue
            items.append({
                "id": node.id if hasattr(node, "id") else nid,
                "content": payload.get("content", ""),
                "source": payload.get("source", ""),
                "session_id": payload.get("session_id", ""),
                "character_id": payload.get("character_id", ""),
                "keywords": payload.get("keywords", []),
                "importance": payload.get("importance", 3),
                "category": payload.get("category", ""),
                "status": payload.get("status", "pending"),
                "created_at": payload.get("created_at", ""),
            })

        # 按时间倒序
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items[offset:offset + limit]

    except Exception as e:
        logger.error(f"缓冲区列表查询失败: {e}")
        return []


def get_stats() -> dict:
    """统计：总数、来源分布、待整理数"""
    if not is_enabled():
        return {"enabled": False}

    try:
        db = _get_db()
        node_ids = db.all_node_ids()

        total = 0
        pending = 0
        confirmed = 0
        discarded = 0
        sources = {}

        for nid in node_ids:
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            total += 1
            s = payload.get("status", "pending")
            if s == "pending":
                pending += 1
            elif s == "confirmed":
                confirmed += 1
            elif s == "discarded":
                discarded += 1
            src = payload.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1

        return {
            "enabled": True,
            "total": total,
            "pending": pending,
            "confirmed": confirmed,
            "discarded": discarded,
            "sources": sources,
        }

    except Exception as e:
        logger.error(f"缓冲区统计失败: {e}")
        return {"enabled": True, "total": 0, "error": str(e)}


def update_status(node_id: int, status: str) -> bool:
    """更新条目状态（pending / confirmed / discarded）"""
    try:
        db = _get_db()
        node = db.get(node_id)
        if not node:
            return False
        payload = node.payload if hasattr(node, "payload") else {}
        payload["status"] = status
        db.update(node_id, payload)
        db.flush()
        return True
    except Exception as e:
        logger.error(f"缓冲区状态更新失败 (节点 {node_id}): {e}")
        return False


def update_content(
    node_id: int,
    content: str | None = None,
    category: str | None = None,
    tags: list[str] | None = None,
    importance: int | None = None,
) -> bool:
    """更新条目内容（不影响状态，保存 ≠ 审批）"""
    try:
        db = _get_db()
        node = db.get(node_id)
        if not node:
            return False
        payload = node.payload if hasattr(node, "payload") else {}
        if content is not None:
            payload["content"] = content[:4000]
        if category is not None:
            payload["category"] = category
        if tags is not None:
            payload["keywords"] = tags
        if importance is not None:
            payload["importance"] = importance
        payload["edited_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        db.update(node_id, payload)
        db.flush()
        return True
    except Exception as e:
        logger.error(f"缓冲区内容更新失败 (节点 {node_id}): {e}")
        return False


def discard(node_id: int) -> bool:
    """丢弃一条缓冲区记录"""
    return update_status(node_id, "discarded")


async def confirm_single(
    node_id: int,
    target_category: str = "",
) -> bool:
    """确认单条 → 生成 MD 源文件 → 大模型重算向量 → 写入目标 TDB

    Args:
        node_id: 缓冲区节点 ID
        target_category: 目标分类（空=保持原分类）
    """
    if not is_enabled():
        return False

    try:
        db = _get_db()
        node = db.get(node_id)
        if not node:
            return False

        payload = node.payload if hasattr(node, "payload") else {}
        content = payload.get("content", "")
        if not content:
            return False

        cat = target_category or payload.get("category", "context")

        # 生成 MD 源文件（保证 knowledge 条目都有源文件）
        md_path = _generate_source_md(content, cat, payload)

        # 用大模型重新 embedding
        target_db, new_vector = await _reembed_to_target(content, cat)
        if not target_db or not new_vector:
            return False

        # 写入目标 TDB
        target_payload = {
            k: v for k, v in payload.items()
            if k not in ("status",)
        }
        target_payload["category"] = cat
        target_payload["source"] = payload.get("source", "")
        target_payload["buffer_confirmed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        if md_path:
            target_payload["source_path"] = md_path

        target_db.insert(new_vector, target_payload)
        target_db.flush()

        # 标记缓冲区条目为 confirmed
        update_status(node_id, "confirmed")

        logger.info(f"缓冲区确认: 节点 {node_id} → {cat}" + (f" (MD: {md_path})" if md_path else ""))
        return True

    except Exception as e:
        logger.error(f"缓冲区确认失败 (节点 {node_id}): {e}")
        return False


def _generate_source_md(content: str, category: str, payload: dict) -> str | None:
    """为确认的条目生成 MD 源文件

    Returns: 相对路径（如 knowledge/from_chat/xxx.md），失败返回 None
    """
    try:
        import os
        data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        md_dir = os.path.join(data_dir, "knowledge", "from_chat")
        os.makedirs(md_dir, exist_ok=True)

        now_str = time.strftime("%Y-%m-%dT%H:%M:%S")
        timestamp = str(int(time.time()))[-6:]
        filename = f"{now_str.replace(':', '').replace('T', '_')}-buf{timestamp}.md"
        filepath = os.path.join(md_dir, filename)

        tags = payload.get("keywords", [])
        source = payload.get("source", "")
        importance = payload.get("importance", 3)

        lines = [
            f"[{now_str}] {category} | 重要度: {importance}",
            "",
            content,
        ]
        if tags:
            lines.append(f"\nTag: {', '.join(tags)}")
        if source:
            lines.append(f"\n来源: {source}")

        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

        return f"knowledge/from_chat/{filename}"

    except Exception as e:
        logger.warning(f"MD 源文件生成失败: {e}")
        return None


async def consolidate(buffer_ids: list[int] | None = None) -> dict:
    """AI 批量整理缓冲区（新管线）

    调用 LLM 一次性完成：话题拆分 + 文本提炼 + TDB 路由 + 图谱提取
    生成的知识卡片写入 MD 文件，图谱数据存入目标 TDB（draft 状态）
    buffer 条目标记 processing

    Args:
        buffer_ids: 指定整理的节点 ID 列表（空=全部 pending）

    Returns:
        {"cards": N, "entities": N, "relations": N, "md_files": [...], "errors": N}
    """
    if not is_enabled():
        return {"cards": 0, "entities": 0, "relations": 0, "md_files": [], "errors": 0, "error": "buffer disabled"}

    try:
        from lumen.services.consolidation import run_consolidation

        # 取待整理条目
        items = None
        if buffer_ids:
            db = _get_db()
            items = []
            for nid in db.all_node_ids():
                if nid in buffer_ids:
                    try:
                        node = db.get(nid)
                    except Exception:
                        continue
                    if node:
                        payload = node.payload if hasattr(node, "payload") else {}
                        items.append((nid, payload))

        return await run_consolidation(buffer_items=items)

    except Exception as e:
        logger.error(f"AI 整理失败: {e}")
        return {"cards": 0, "entities": 0, "relations": 0, "md_files": [], "errors": 1, "error": str(e)}


async def consolidate_direct(buffer_ids: list[int] | None = None) -> dict:
    """直接整理（后备方案，不走 LLM 提炼）

    逐条用大模型重新 embedding → 写入目标 TDB
    用于 LLM 不可用或用户明确要求跳过 AI 提炼的场景

    Args:
        buffer_ids: 指定整理的节点 ID 列表（空=全部 pending）

    Returns:
        {"confirmed": N, "failed": N}
    """
    if not is_enabled():
        return {"confirmed": 0, "failed": 0, "error": "buffer disabled"}

    try:
        db = _get_db()

        # 取待整理条目
        items = []
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if payload.get("status") != "pending":
                continue
            if buffer_ids and nid not in buffer_ids:
                continue
            items.append((nid, payload))

        if not items:
            return {"confirmed": 0, "failed": 0}

        confirmed_count = 0
        failed_count = 0

        for node_id, payload in items:
            content = payload.get("content", "")
            cat = payload.get("category", "context")

            if not content:
                discard(node_id)
                failed_count += 1
                continue

            target_db, new_vector = await _reembed_to_target(content, cat)
            if not target_db or not new_vector:
                failed_count += 1
                continue

            # 写入目标 TDB（保留原始 payload，去掉 status）
            target_payload = {k: v for k, v in payload.items() if k != "status"}
            target_payload["buffer_confirmed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")

            target_db.insert(new_vector, target_payload)
            target_db.flush()

            update_status(node_id, "confirmed")
            confirmed_count += 1

        logger.info(f"缓冲区整理完成: {confirmed_count} 条确认, {failed_count} 条失败")
        return {"confirmed": confirmed_count, "failed": failed_count}

    except Exception as e:
        logger.error(f"缓冲区整理失败: {e}")
        return {"confirmed": 0, "failed": 0, "error": str(e)}


async def _reembed_to_target(
    content: str, category: str,
) -> tuple[triviumdb.TriviumDB | None, list[float] | None]:
    """用大模型重新 embedding，返回 (目标TDB, 新向量)

    根据分类决定写入哪个 TDB：
    - active_* (daily_note) → knowledge.tdb
    - 其他 → knowledge.tdb（目前统一走知识库）
    """
    try:
        # 用大模型重新 embedding
        backend = await get_embedding_service("knowledge")
        if not backend:
            logger.warning("知识库嵌入服务不可用，无法整理")
            return None, None

        new_vector = await backend.encode(content)
        if not new_vector:
            return None, None

        # 目标 TDB：目前统一走 knowledge.tdb
        from lumen.services.knowledge import _get_db
        target_db = _get_db()

        return target_db, new_vector

    except Exception as e:
        logger.error(f"大模型重算 embedding 失败: {e}")
        return None, None


def cleanup() -> int:
    """清理已确认/已丢弃的条目（释放小模型向量空间）"""
    if not is_enabled():
        return 0

    try:
        db = _get_db()
        count = 0
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if payload.get("status") in ("confirmed", "discarded"):
                db.delete(nid)
                count += 1
        if count:
            db.flush()
            logger.info(f"缓冲区清理: {count} 条")
        return count

    except Exception as e:
        logger.error(f"缓冲区清理失败: {e}")
        return 0


def _check_auto_consolidate():
    """检查 pending 数量是否达到阈值，触发自动整理"""
    try:
        from lumen.services.runtime_config import get
        threshold = get("buffer_auto_consolidate_threshold", 20)
        if threshold <= 0:
            return

        stats = get_stats()
        if not stats.get("enabled"):
            return
        pending = stats.get("pending", 0)
        if pending < threshold:
            return

        logger.info(f"缓冲区自动整理触发: {pending} 条待整理 >= 阈值 {threshold}")
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(consolidate())
            logger.info(f"自动整理完成: {result}")
        finally:
            loop.close()

    except Exception as e:
        logger.error(f"自动整理检查失败: {e}")


def close():
    """关闭缓冲区 TriviumDB"""
    global _db
    if _db is not None:
        _db.flush()
        _db = None
        logger.info("缓冲区 TriviumDB 已关闭")
