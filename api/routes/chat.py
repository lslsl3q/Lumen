"""
聊天相关 API 接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

router = APIRouter()

# 导入核心逻辑
from lumen.core.session import get_session_manager
from lumen.core.chat import chat_stream, ChatSession


# ========================================
# 请求/响应模型定义
# ========================================

class ChatRequest(BaseModel):
    """发送消息请求"""
    message: str
    session_id: Optional[str] = None  # 可选：指定会话ID


class StreamRequest(BaseModel):
    """流式聊天请求"""
    message: str
    session_id: str = "default"


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
        async for event in chat_stream(req.message, session):
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
            async for event in chat_stream(req.message, session):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

        # SSE 连接关闭信号
        yield "data: [DONE]\n\n"

    # SSE 必要的响应头：禁止缓冲
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


@router.get("/history")
async def get_history(session_id: str = "default"):
    """
    获取指定会话的聊天历史

    优先从内存 SessionManager 读取，若会话不在内存中则直接从数据库读取。
    这样后端重启后也能加载历史。

    Args:
        session_id: 会话ID，默认为 "default"

    Returns:
        消息列表（不含系统提示词）
    """
    try:
        manager = get_session_manager()
        session = manager.get(session_id)

        if session:
            # 会话在内存中，直接用内存数据
            messages = session.messages
        else:
            # 会话不在内存（后端重启或从未加载），从数据库读取
            from lumen.services import history as history_service
            messages = history_service.load_session(session_id)

        # 过滤掉系统提示词，只返回用户和助手的对话
        result = [
            {"role": msg["role"], "content": msg["content"]}
            for msg in messages
            if msg["role"] in ("user", "assistant")
        ]

        return {"messages": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史失败: {str(e)}")
