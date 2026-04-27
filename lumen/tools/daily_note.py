"""
工具：daily_note — AI 日记/档案保存
AI 判断何时保存重要信息，跨会话可用
三写：TriviumDB（向量）+ SQLite（元数据 + FTS5）+ MD 文件（用户可读）
"""

import os
import time
import random
import string
import asyncio
import logging
import concurrent.futures

from lumen.tool import success_result, error_result, ErrorCode, get_tool_context

logger = logging.getLogger(__name__)


def _generate_note_id() -> str:
    """生成笔记ID: dn{timestamp6}{random3}"""
    timestamp = str(int(time.time()))[-6:]
    random_chars = "".join(random.choices(string.ascii_lowercase, k=3))
    return f"dn{timestamp}{random_chars}"


def _write_md_file(md_dir: str, note_id: str, now_str: str,
                   category: str, importance: int,
                   content_display: str, tags: list[str]) -> str:
    """写 MD 文件（一笔记一文件），返回相对路径"""
    os.makedirs(md_dir, exist_ok=True)

    filename = f"{now_str.replace(':', '').replace('T', '_')}-{note_id}.md"
    filepath = os.path.join(md_dir, filename)

    lines = [
        f"[{now_str}] {category} | 重要度: {importance}",
        content_display,
    ]
    if tags:
        lines.append(f"Tag: {', '.join(tags)}")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return filename


def _do_embedding_and_store(content: str, character_id: str, session_id: str,
                            content_display: str, md_filename: str,
                            tags: list[str], importance: int, category: str,
                            note_id: str, now_str: str):
    """在线程中运行异步 embedding + TriviumDB 存储"""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            _async_store(content, character_id, session_id, content_display,
                         md_filename, tags, importance, category, note_id, now_str)
        )
    except Exception as e:
        logger.error(f"日记向量化失败: {e}")
    finally:
        loop.close()


async def _async_store(content: str, character_id: str, session_id: str,
                       content_display: str, md_filename: str,
                       tags: list[str], importance: int, category: str,
                       note_id: str, now_str: str):
    """异步：向量化 + 存储（缓冲模式 → buffer.tdb，否则 → knowledge.tdb）"""
    from lumen.services.buffer import is_enabled as buffer_enabled, add as buffer_add

    if buffer_enabled():
        # 缓冲模式：写 buffer.tdb（小模型向量），MD 文件已在外部保存
        await buffer_add(
            content=content,
            source="daily_note",
            session_id=session_id,
            character_id=character_id,
            keywords=tags,
            importance=importance,
            category=f"active_{category}",
            extra_payload={
                "file_id": note_id,
                "source_path": f"active/{md_filename}",
                "filename": md_filename,
                "content_display": content_display,
            },
        )
        logger.info(f"日记已存入缓冲区: {note_id}")
        return

    # 原有逻辑：直接写 knowledge.tdb（大模型向量）
    from lumen.services.embedding import get_service
    backend = await get_service("knowledge")
    if not backend:
        logger.warning("知识库嵌入服务不可用，跳过向量存储")
        return

    vector = await backend.encode(content)
    if not vector:
        logger.warning("嵌入编码失败，跳过向量存储")
        return

    from lumen.services.knowledge import _get_db
    db = _get_db()
    rel_path = f"active/{md_filename}"
    payload = {
        "file_id": note_id,
        "source_path": rel_path,
        "filename": md_filename,
        "category": f"active_{category}",
        "source": "daily_note",
        "character_id": character_id,
        "session_id": session_id,
        "content": content,
        "content_display": content_display,
        "tags": tags,
        "importance": importance,
        "created_at": now_str,
    }
    db.insert(vector, payload)
    db.flush()
    logger.info(f"日记向量已存储到 knowledge.tdb: {note_id}")


def execute(params: dict, command: str = "") -> dict:
    """保存日记/档案 — 三写（TriviumDB + SQLite + MD）"""
    content = params.get("content", "").strip()
    if not content:
        return error_result(
            "daily_note",
            ErrorCode.PARAM_EMPTY,
            "内容不能为空",
            {"provided_params": params},
        )

    tags = params.get("tags", [])
    if not isinstance(tags, list):
        tags = [tags] if tags else []
    tags = [str(t).strip() for t in tags if str(t).strip()]

    importance = params.get("importance", 3)
    try:
        importance = max(1, min(int(importance), 5))
    except (ValueError, TypeError):
        importance = 3

    category = params.get("category", "context")
    if category not in ("preference", "fact", "context", "decision"):
        category = "context"

    # 从工具上下文获取 session_id / character_id
    ctx = get_tool_context()
    character_id = ctx.get("character_id", "")
    session_id = ctx.get("session_id", "")

    # content_display: 加占位符前缀
    content_display = f"{{{{char_name}}}}记得{content}"

    note_id = _generate_note_id()
    now_str = time.strftime("%Y-%m-%dT%H:%M:%S")

    # 1. 写 MD 文件
    from lumen.config import DAILY_NOTE_DIR
    md_dir = os.path.join(DAILY_NOTE_DIR, "active")
    md_filename = _write_md_file(md_dir, note_id, now_str, category,
                                 importance, content_display, tags)

    # 2. 存 SQLite + FTS5
    from lumen.services import history
    history.save_active_memory(
        memory_id=note_id,
        character_id=character_id,
        content=content,
        content_display=content_display,
        md_path=md_filename,
        tags=tags,
        importance=importance,
        category=category,
        session_id=session_id,
    )

    # 3. 向量化 + 存 TriviumDB（在线程中运行，不阻塞）
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(
            _do_embedding_and_store,
            content, character_id, session_id, content_display,
            md_filename, tags, importance, category, note_id, now_str,
        )

    logger.info(f"日记已保存: {note_id} ({category}, 重要度:{importance})")

    return success_result(
        "daily_note",
        f"已保存日记 [{note_id}]: {content[:80]}{'...' if len(content) > 80 else ''}",
        note_id=note_id,
        category=category,
        importance=importance,
        tags=tags,
    )
