"""
写作模式 Chat 线程 REST API — 线程/消息 CRUD + 向量化
"""

import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumen.services.storage.writing import (
    create_chat_thread, list_chat_threads, get_chat_thread,
    update_chat_thread, delete_chat_thread,
    create_chat_message, list_chat_messages,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateThreadRequest(BaseModel):
    book_id: str
    name: str = ""
    ai_mode: str = "chat"


class UpdateThreadRequest(BaseModel):
    name: str | None = None
    ai_mode: str | None = None
    pinned: bool | None = None
    pinned_side: str | None = None


class CreateMessageRequest(BaseModel):
    role: str
    content: str
    metadata: str | None = None
    vectorize: bool = True


@router.get("/threads")
async def api_list_threads(book_id: str):
    rows = await asyncio.to_thread(list_chat_threads, book_id)
    return rows


@router.post("/threads")
async def api_create_thread(req: CreateThreadRequest):
    row = await asyncio.to_thread(create_chat_thread, req.book_id, req.name, req.ai_mode)
    return row


@router.get("/threads/{thread_id}")
async def api_get_thread(thread_id: str):
    row = await asyncio.to_thread(get_chat_thread, thread_id)
    if not row:
        raise HTTPException(404, "线程不存在")
    return row


@router.patch("/threads/{thread_id}")
async def api_update_thread(thread_id: str, req: UpdateThreadRequest):
    existing = await asyncio.to_thread(get_chat_thread, thread_id)
    if not existing:
        raise HTTPException(404, "线程不存在")
    fields = req.model_dump(exclude_none=True)
    if "pinned" in fields:
        fields["pinned"] = 1 if fields["pinned"] else 0
    row = await asyncio.to_thread(update_chat_thread, thread_id, **fields)
    return row


@router.delete("/threads/{thread_id}")
async def api_delete_thread(thread_id: str):
    await asyncio.to_thread(delete_chat_thread, thread_id)
    return {"ok": True}


@router.get("/threads/{thread_id}/messages")
async def api_list_messages(thread_id: str, limit: int = 100, before: float | None = None):
    rows = await asyncio.to_thread(list_chat_messages, thread_id, limit, before)
    return rows


@router.post("/threads/{thread_id}/messages")
async def api_create_message(thread_id: str, req: CreateMessageRequest):
    existing = await asyncio.to_thread(get_chat_thread, thread_id)
    if not existing:
        raise HTTPException(404, "线程不存在")
    row = await asyncio.to_thread(
        create_chat_message, thread_id, req.role, req.content, req.metadata,
        book_id=existing["book_id"],
    )

    # 异步向量化（不阻塞响应）
    if req.vectorize and req.content and req.role in ("user", "assistant"):
        asyncio.create_task(_vectorize_writing_message(
            message_id=row["id"],
            content=req.content,
            role=req.role,
            thread_id=thread_id,
            book_id=existing["book_id"],
            created_at=row["created_at"],
        ))

    return row


async def _vectorize_writing_message(
    message_id: str, content: str, role: str,
    thread_id: str, book_id: str, created_at: float,
):
    """后台向量化写作 Chat 消息"""
    from lumen.services.memory import vectorize_message

    # UUID 转 stable int hash
    msg_int = int(message_id.replace("-", "")[:15], 16) & 0x7FFFFFFF
    session_id = f"writing_{book_id}_{thread_id}"
    character_id = "writing"
    created_str = datetime.fromtimestamp(created_at).isoformat()

    try:
        await vectorize_message(
            msg_int, content, role, session_id, character_id,
            created_at=created_str, metadata={"type": "normal", "source": "writing"},
        )
    except Exception as e:
        logger.debug(f"写作消息向量化失败: {e}")
