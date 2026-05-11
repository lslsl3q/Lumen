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
                   content_display: str, tags: list[str],
                   character_id: str = "") -> str:
    """写 MD 文件（一笔记一文件），带 YAML frontmatter，返回相对路径"""
    os.makedirs(md_dir, exist_ok=True)

    filename = f"{now_str.replace(':', '').replace('T', '_')}-{note_id}.md"
    filepath = os.path.join(md_dir, filename)

    lines = [
        "---",
        f"id: {note_id}",
    ]
    if character_id:
        lines.append(f"owner_id: {character_id}")
    lines.append(f"created: {now_str}")
    lines.append("---")
    lines.append("")
    lines.append(f"[{now_str}] {category} | 重要度: {importance}")
    lines.append(content_display)
    if tags:
        lines.append(f"Tag: {', '.join(tags)}")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return filename


def _do_embedding_and_store(content: str, character_id: str, session_id: str,
                            content_display: str, md_filename: str,
                            tags: list[str], importance: int, category: str,
                            note_id: str, now_str: str, metadata: dict):
    """在线程中运行异步 embedding + TriviumDB 存储"""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            _async_store(content, character_id, session_id, content_display,
                         md_filename, tags, importance, category, note_id, now_str,
                         metadata)
        )
    except Exception as e:
        logger.error(f"日记向量化失败: {e}")
    finally:
        loop.close()


async def _async_store(content: str, character_id: str, session_id: str,
                       content_display: str, md_filename: str,
                       tags: list[str], importance: int, category: str,
                       note_id: str, now_str: str, metadata: dict):
    """异步：大模型向量化 → 存入 agent_knowledge.tdb（阵营 B）"""
    from lumen.services.search.embedding import get_service
    backend = await get_service("agent_knowledge")
    if not backend:
        logger.warning("Agent 知识库嵌入服务不可用，跳过向量存储")
        return

    vector = await backend.encode(content)
    if not vector:
        logger.warning("嵌入编码失败，跳过向量存储")
        return

    from lumen.services.tdb_registry import get_tdb
    db = get_tdb("agent_knowledge")
    payload = {
        "file_id": note_id,
        "source_path": md_filename,
        "filename": metadata.get("filename", md_filename.split("/")[-1] if "/" in md_filename else md_filename),
        "category": f"active_{category}",
        "source": "daily_note",
        "owner_id": character_id,
        "access_list": [character_id],
        "character_id": character_id,
        "session_id": session_id,
        "content": content,
        "content_display": content_display,
        "tags": tags,
        "importance": importance,
        "created_at": now_str,
    }
    node_id = db.insert(vector, payload)
    db.flush()

    # TriviumDB 文本索引（BM25 + AC 关键词）
    try:
        db.index_text(node_id, content)
        for tag in tags:
            if tag:
                db.index_keyword(node_id, tag)
        if category:
            db.index_keyword(node_id, category)
        db.build_text_index()
    except Exception as e:
        logger.debug(f"日记文本索引失败 ({note_id}): {e}")

    logger.info(f"日记向量已存储到 agent_knowledge.tdb: {note_id}")

    # ── BM25 写入（FTS5 全文检索） ──
    try:
        from lumen.services.knowledge import chunks as knowledge_chunks
        knowledge_chunks.save_knowledge_chunks_batch(
            note_id, md_filename,
            md_filename.split("/")[-1] if "/" in md_filename else md_filename,
            f"active_{category}", [content],
            kb_name="agent_knowledge",
        )
    except Exception as e:
        logger.warning(f"日记 BM25 写入失败 ({note_id}): {e}")

    # ── 稀疏向量写入 ──
    if hasattr(backend, 'encode_with_sparse'):
        try:
            from lumen.services.search.sparse_store import save_sparse_batch
            sparse_result = await backend.encode_with_sparse(content, instruction_type="document")
            if sparse_result:
                _, sparse_vec = sparse_result
                if sparse_vec:
                    save_sparse_batch(
                        [{
                            "node_id": node_id,
                            "file_id": note_id,
                            "chunk_index": 0,
                            "category": f"active_{category}",
                            "sparse_data": sparse_vec,
                        }],
                        kb_name="agent_knowledge",
                    )
        except Exception as e:
            logger.warning(f"日记稀疏向量写入失败 ({note_id}): {e}")

    # ── 句子向量化 ──
    try:
        from lumen.services.knowledge._core import _get_sentence_db_for
        from lumen.services.knowledge.chunker import split_sentences
        sentence_backend = await get_service("knowledge_sentences")
        if sentence_backend:
            sentences = split_sentences(content)
            if sentences:
                sentence_vectors = await sentence_backend.encode_batch(sentences)
                if sentence_vectors:
                    sdb = _get_sentence_db_for("agent_knowledge")
                    for j, (sent, svec) in enumerate(zip(sentences, sentence_vectors)):
                        if svec:
                            sdb.insert(svec, {
                                "file_id": note_id,
                                "source_path": md_filename,
                                "category": f"active_{category}",
                                "chunk_index": 0,
                                "sentence_index": j,
                                "content": sent,
                            })
                    sdb.flush()
    except Exception as e:
        logger.warning(f"日记句子向量化失败 ({note_id}): {e}")

    # T19: 日记图谱抽取
    try:
        from lumen.services.graph import extract_and_store
        await extract_and_store(
            content=content, tdb_name="agent_knowledge",
        )
    except Exception:
        pass

    # 图谱提取 — 通过事件处理器异步提取实体和关系
    try:
        from lumen.services.event_queue import enqueue_event
        enqueue_event(
            content=content,
            event_type="diary",
            character_id=character_id,
            session_id=session_id,
            source_id=note_id,
            metadata={"category": category, "importance": importance, "tags": tags},
        )
    except Exception:
        pass

    # T22 Step 4: 通知深梦境调度器（通过事件队列，由 event_processor 消费者处理）
    # diary 事件的 dream 通知已在 core/event_processor _consumer 中处理


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

    # ── 写入权限验证（Fail-Closed：默认拒绝） ──
    target = params.get("target", "diary")
    character = ctx.get("character", {})
    write_targets = character.get("write_targets", {}) if character_id else {}

    # 没配置写入目标 → 直接拒绝
    target_path_template = write_targets.get(target)
    if not target_path_template:
        return error_result(
            "daily_note",
            ErrorCode.PARAM_INVALID,
            f"角色未配置 [{target}] 的写入目标路径",
            {"target": target},
        )

    if character_id:
        resolved_path = target_path_template.replace("{character_id}", character_id)
        resource_type = "diary" if target == "diary" else "knowledge"
        resource_id = "agent_knowledge" if resource_type == "diary" else "knowledge"
        try:
            from lumen.services.access_control import get_instance
            acl = get_instance()
            if not acl.can_write(character_id, resource_type, resource_id, resolved_path):
                return error_result(
                    "daily_note",
                    ErrorCode.PARAM_INVALID,
                    f"没有写入权限: {resolved_path}",
                    {"target": target, "path": resolved_path},
                )
        except Exception as e:
            logger.warning(f"ACL 写入权限检查失败，跳过检查: {e}")

    # content_display: 日记按 Agent 分文件夹，不需要占位符
    content_display = content

    note_id = _generate_note_id()
    now_str = time.strftime("%Y-%m-%dT%H:%M:%S")

    # 1. 写 MD 文件 → data/知识库/agent_knowledge/{character_id}/diary/
    from lumen.config import DAILY_NOTE_DIR
    md_dir = os.path.join(DAILY_NOTE_DIR, character_id, "diary") if character_id else os.path.join(DAILY_NOTE_DIR, "_shared")
    md_filename = _write_md_file(md_dir, note_id, now_str, category,
                                 importance, content_display, tags, character_id)

    # 相对路径：{character_id}/diary/{md_filename}
    rel_md_path = f"{character_id}/diary/{md_filename}" if character_id else f"_shared/{md_filename}"

    # 2. 存 SQLite + FTS5
    from lumen.services.memory import active_store
    active_store.save_active_memory(
        memory_id=note_id,
        character_id=character_id,
        content=content,
        content_display=content_display,
        md_path=rel_md_path,
        tags=tags,
        importance=importance,
        category=category,
        session_id=session_id,
    )

    # 3. 向量化 + 存 agent_knowledge.tdb（在线程中运行，不阻塞）
    metadata = {
        "filename": md_filename,
        "file_id": note_id,
        "owner_id": character_id,
        "access_list": [character_id],
        "created_at": now_str,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(
            _do_embedding_and_store,
            content, character_id, session_id, content_display,
            rel_md_path, tags, importance, category, note_id, now_str, metadata,
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
