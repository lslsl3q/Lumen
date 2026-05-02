"""
聊天相关 API 接口
"""

import asyncio
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# 导入核心逻辑
from lumen.core.session import get_session_manager, ChatSession
from lumen.agent_chat import agent_chat_stream
from lumen.components.react_acting import request_cancel


# ========================================
# 请求/响应模型定义
# ========================================

class ChatRequest(BaseModel):
    """发送消息请求"""
    message: str
    session_id: Optional[str] = None  # 可选：指定会话ID
    response_style: str = "balanced"


class StreamRequest(BaseModel):
    """流式聊天请求"""
    message: str
    session_id: str = "default"
    memory_debug: bool = False  # /tokens 命令开启记忆调试
    response_style: str = "balanced"


class ChatResponse(BaseModel):
    """聊天响应"""
    reply: str
    session_id: str


# ========================================
# API 端点
# ========================================

@router.post("/send")
async def send_message(req: ChatRequest) -> ChatResponse:
    """
    发送消息并获取 AI 回复（非流式）

    内部复用 chat_stream 的事件流，收集所有文本事件拼接成完整回复

    Args:
        req: 包含用户消息的请求体

    Returns:
        AI 的完整回复
    """
    try:
        manager = get_session_manager()
        session = manager.get_or_create(req.session_id or "default")

        reply_parts = []
        async for event in agent_chat_stream(req.message, session, memory_debug=False):
            if event.get("type") == "text":
                reply_parts.append(event["content"])

        return ChatResponse(
            reply="".join(reply_parts),
            session_id=session.session_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聊天失败: {str(e)}")


@router.post("/stream")
async def stream_chat(req: StreamRequest):
    """
    流式聊天（Server-Sent Events）

    实时返回 AI 的文本片段、工具调用状态等事件

    SSE 事件格式：
    - data: {"type": "text", "content": "..."}     文本片段
    - data: {"type": "status", "status": "..."}    状态变化
    - data: {"type": "tool_start", "tool": "..."}  工具开始执行
    - data: {"type": "tool_result", "tool": "..."} 工具执行结果
    - data: {"type": "memory_debug", ...}          记忆调试分层信息
    - data: {"type": "done", "exit_reason": "..."} 流式结束
    - data: [DONE]                                  连接关闭信号

    Args:
        req: 包含用户消息和会话ID的请求体

    Returns:
        SSE 格式的流式响应
    """
    from fastapi.responses import StreamingResponse

    manager = get_session_manager()
    session = manager.get_or_create(req.session_id)

    async def generate():
        """生成 SSE 事件流（chat_stream 本身已是异步生成器，无需线程池翻译）"""
        try:
            async for event in agent_chat_stream(req.message, session, memory_debug=req.memory_debug, response_style=req.response_style):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            # 清理可能残留的取消标志，防止下次对话被误判为已取消
            from lumen.components.react_acting import _clear_cancel
            _clear_cancel(session.session_id)

        # SSE 连接关闭信号
        yield "data: [DONE]\n\n"

    # SSE 必要的响应头：禁止缓冲
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


def _is_tool_message(msg: dict) -> bool:
    """判断是否为工具调用/结果/系统反馈消息（不应展示给用户）"""
    # metadata 驱动：统一过滤所有内部消息
    meta = msg.get("metadata")
    if isinstance(meta, dict) and meta.get("type") in (
        "tool_result", "tool_result_parallel", "system_feedback",
    ):
        return True
    content = msg.get("content", "").strip()
    if msg.get("role") == "assistant":
        if 'type": "tool_call' in content or 'type":"tool_call' in content:
            return True
    if msg.get("role") == "user":
        if content.startswith('<tool_result'):
            return True
        if content.startswith('{"success"') or content.startswith('{"error_code"'):
            return True
    return False


@router.get("/history")
async def get_history(session_id: str = "default"):
    """
    获取指定会话的聊天历史

    优先从内存 SessionManager 读取，若会话不在内存中则直接从数据库读取。
    这样后端重启后也能加载历史。

    Args:
        session_id: 会话ID，默认为 "default"

    Returns:
        消息列表（不含系统提示词和工具调用消息）
    """
    try:
        manager = get_session_manager()
        session = manager.get(session_id)

        if session:
            # 会话在内存中，直接用内存数据
            messages = session.messages
        else:
            # 会话不在内存（后端重启或从未加载），从数据库读取（async 不阻塞事件循环）
            from lumen.services import history as history_service
            messages = await asyncio.to_thread(history_service.load_session, session_id)

        # 过滤掉系统提示词和工具调用消息，只返回用户和助手的对话
        result = [
            {
                "id": msg.get("id"),
                "role": msg["role"],
                "content": msg["content"],
                "hidden": False,
            }
            for msg in messages
            if msg["role"] in ("user", "assistant") and not _is_tool_message(msg)
        ]

        return {"messages": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史失败: {str(e)}")


# ========================================
# 消息编辑/删除
# ========================================

class MessageEditRequest(BaseModel):
    session_id: str
    message_id: int
    content: str


class MessageDeleteRequest(BaseModel):
    session_id: str
    message_id: int


class RegenerateRequest(BaseModel):
    session_id: str
    message_id: int


class BranchRequest(BaseModel):
    session_id: str
    message_id: int


@router.patch("/message")
async def edit_message(req: MessageEditRequest):
    """编辑消息内容（同步更新 SQLite + memory.tdb 向量）"""
    from lumen.services import history as history_service

    success = await asyncio.to_thread(history_service.update_message, req.message_id, req.content)
    if not success:
        raise HTTPException(status_code=404, detail="消息不存在")

    # 同步更新内存中的消息
    manager = get_session_manager()
    session = manager.get(req.session_id)
    if session:
        for msg in session.messages:
            if msg.get("id") == req.message_id:
                msg["content"] = req.content
                break

    # 同步更新 memory.tdb 向量
    try:
        from lumen.services.vector_store import _get_db
        db = _get_db()
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if payload.get("message_id") == req.message_id:
                # 重新向量化
                from lumen.services.embedding import get_service
                backend = await get_service("memory")
                if backend:
                    new_vector = await backend.encode(req.content)
                    if new_vector:
                        payload["content"] = req.content
                        db.update_vector(nid, new_vector)
                        db.update_payload(nid, payload)
                        db.flush()
                        logger.info(f"消息编辑同步向量: message_id={req.message_id}, node={nid}")
                break
    except Exception as e:
        logger.warning(f"消息编辑向量同步失败: {e}")

    return {"success": True}


@router.delete("/message")
async def delete_message(req: MessageDeleteRequest):
    """删除消息（同步删除 SQLite + memory.tdb 向量）"""
    from lumen.services import history as history_service

    success = await asyncio.to_thread(history_service.delete_message, req.message_id)
    if not success:
        raise HTTPException(status_code=404, detail="消息不存在")

    # 同步删除内存中的消息
    manager = get_session_manager()
    session = manager.get(req.session_id)
    if session:
        session.messages = [msg for msg in session.messages if msg.get("id") != req.message_id]

    # 同步删除 memory.tdb 向量
    try:
        from lumen.services.vector_store import _get_db
        db = _get_db()
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if payload.get("message_id") == req.message_id:
                db.delete(nid)
                db.flush()
                logger.info(f"消息删除同步向量: message_id={req.message_id}, node={nid}")
                break
    except Exception as e:
        logger.warning(f"消息删除向量同步失败: {e}")

    return {"success": True}


@router.post("/regenerate")
async def regenerate_message(req: RegenerateRequest):
    """重新生成 AI 回复

    删除该 AI 消息及之后的所有消息，返回触发回复所需的用户消息内容。
    前端收到后用该内容重新调用流式接口。
    """
    from lumen.services import history as history_service

    # 从内存 session 找到该 AI 消息前面的最后一条 user 消息
    manager = get_session_manager()
    session = manager.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    user_message = None
    for msg in reversed(session.messages):
        msg_id = msg.get("id")
        if msg_id is not None and msg_id >= req.message_id:
            continue
        if msg["role"] == "user" and not msg.get("metadata", {}).get("type") == "tool_result":
            user_message = msg["content"]
            break

    if not user_message:
        raise HTTPException(status_code=400, detail="未找到对应的用户消息")

    # 删除该消息及之后的所有消息（DB + 内存）
    await asyncio.to_thread(history_service.delete_messages_from, req.session_id, req.message_id)
    session.messages = [msg for msg in session.messages
                        if msg.get("id") is not None and msg["id"] < req.message_id]

    return {"user_message": user_message, "session_id": req.session_id}


@router.post("/branch")
async def create_branch(req: BranchRequest):
    """基于某条消息创建分支会话

    创建新会话并复制该消息及之前的所有消息到新会话。
    """
    from lumen.services import history as history_service

    # 获取原会话信息
    manager = get_session_manager()
    session = manager.get(req.session_id)
    character_id = session.character_id if session else "default"

    # 创建新会话
    new_session_id = await asyncio.to_thread(history_service.new_session, character_id)

    # 复制消息
    await asyncio.to_thread(history_service.copy_messages_to, req.session_id, new_session_id, req.message_id)

    # 在内存中也创建对应 session
    new_session = manager.get_or_create(new_session_id)

    return {"new_session_id": new_session_id, "character_id": character_id}


# ========================================
# Compact + Token 用量
# ========================================

class CompactRequest(BaseModel):
    session_id: str


class CancelRequest(BaseModel):
    session_id: str


@router.post("/cancel")
async def cancel_chat(req: CancelRequest):
    """中断指定会话的流式生成"""
    request_cancel(req.session_id)
    return {"cancelled": True}


@router.post("/compact")
async def api_compact(req: CompactRequest):
    """手动触发上下文压缩"""
    from lumen.services.context.compact import compact_session
    from lumen.prompt.character import load_character
    from lumen.config import get_context_size
    from lumen.services.context import fold_tool_calls, filter_for_ai, estimate_messages_tokens

    manager = get_session_manager()
    session = manager.get_or_create(req.session_id)

    result = await compact_session(session)
    return result


@router.get("/token-usage")
async def api_token_usage(session_id: str = "default"):
    """获取当前会话 token 使用情况"""
    from lumen.prompt.character import load_character
    from lumen.config import get_context_size
    from lumen.services.context import fold_tool_calls, filter_for_ai, estimate_messages_tokens
    from lumen.services.context.token_estimator import get_session_usage

    manager = get_session_manager()
    session = manager.get_or_create(session_id)

    character_config = load_character(session.character_id)
    context_size = get_context_size(character_config)

    folded = fold_tool_calls(session.messages)
    filtered = filter_for_ai(folded)
    current_tokens = estimate_messages_tokens(filtered)

    usage = get_session_usage(session_id)

    return {
        "current_tokens": current_tokens,
        "context_size": context_size,
        "usage_percent": round(current_tokens / context_size * 100, 1) if context_size > 0 else 0,
        "threshold_percent": character_config.get("compact_threshold", 0.7) * 100,
        "auto_compact": character_config.get("auto_compact", False),
        "session_total_input": usage["input_tokens"],
        "session_total_output": usage["output_tokens"],
    }
