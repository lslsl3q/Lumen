"""
聊天相关 API 接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

router = APIRouter()

# 导入核心逻辑
from lumen.chat import chat_stream, messages as current_messages


# ========================================
# 请求/响应模型定义
# ========================================

class ChatRequest(BaseModel):
    """发送消息请求"""
    message: str
    session_id: Optional[str] = None  # 可选：指定会话ID


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
        # 调用核心逻辑
        reply = ""
        for chunk in chat_stream(req.message):
            reply = chunk  # 取最后一个完整回复

        # 获取当前会话ID
        from lumen.chat import current_session_id
        session_id = current_session_id or "default"

        return ChatResponse(
            reply=reply,
            session_id=session_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"聊天失败: {str(e)}")


@router.get("/stream")
async def stream_chat(message: str):
    """
    流式聊天（Server-Sent Events）

    实时返回 AI 的每个字，适合打字机效果

    Args:
        message: 用户消息

    Returns:
        SSE 格式的流式响应
    """
    async def generate():
        """生成 SSE 流"""
        try:
            for chunk in chat_stream(message):
                # SSE 格式：data: <内容>\n\n
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"

            # 发送结束标记
            yield "data: [DONE]\n\n"

        except Exception as e:
            # 发送错误信息
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/history")
async def get_history():
    """
    获取当前会话的聊天历史

    Returns:
        消息列表（不含系统提示词）
    """
    try:
        # 过滤掉系统提示词，只返回用户和助手的对话
        history = [
            {"role": msg["role"], "content": msg["content"]}
            for msg in current_messages
            if msg["role"] in ("user", "assistant")
        ]

        return {"messages": history}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史失败: {str(e)}")
