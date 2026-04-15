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

    Args:
        req: 包含用户消息的请求体

    Returns:
        AI 的完整回复
    """
    try:
        manager = get_session_manager()
        session = manager.get_or_create(req.session_id or "default")

        reply = ""
        for chunk in chat_stream(req.message, session):
            reply = chunk

        return ChatResponse(
            reply=reply,
            session_id=session.session_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聊天失败: {str(e)}")


@router.post("/stream")
async def stream_chat(req: StreamRequest):
    """
    流式聊天（Server-Sent Events）

    实时返回 AI 的每个字，适合打字机效果

    Args:
        req: 包含用户消息和会话ID的请求体

    Returns:
        SSE 格式的流式响应
    """
    from fastapi.responses import StreamingResponse

    manager = get_session_manager()
    session = manager.get_or_create(req.session_id)

    async def generate():
        """生成 SSE 流"""
        try:
            for chunk in chat_stream(req.message, session):
                # SSE 格式：data: <内容>\n\n
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"

            # 发送结束标记
            yield "data: [DONE]\n\n"

        except Exception as e:
            # 发送错误信息
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/history")
async def get_history(session_id: str = "default"):
    """
    获取当前会话的聊天历史

    Args:
        session_id: 会话ID，默认为 "default"

    Returns:
        消息列表（不含系统提示词）
    """
    try:
        manager = get_session_manager()
        session = manager.get(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 过滤掉系统提示词，只返回用户和助手的对话
        history = [
            {"role": msg["role"], "content": msg["content"]}
            for msg in session.messages
            if msg["role"] in ("user", "assistant")
        ]

        return {"messages": history}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史失败: {str(e)}")
