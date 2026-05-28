"""
T26 WebSocket 消息处理器 — WS JSON 帧 → Agent.act() 流 → WS JSON 帧

替代旧的 POST /chat/stream SSE 端点。
核心：后端 ReAct 循环、Agent.act()、所有 Component 逻辑不动，只换传输层。
"""

import asyncio
import json
import logging

from fastapi import WebSocket

from lumen.core.session import get_session_manager
from lumen.core.agent_chat import agent_chat_stream
from lumen.components.react_acting import request_cancel, _clear_cancel
from lumen.services.ws_manager import get_ws_manager
from lumen.services.chrome_bridge import get_chrome_bridge

logger = logging.getLogger(__name__)


async def handle_chat(ws: WebSocket, client_id: str, msg: dict):
    """处理 chat 类型的 WS 消息

    流程：
    1. 从 WS 消息中提取参数
    2. 创建/获取会话
    3. 运行 Agent 流（跟 /stream SSE 完全一样的逻辑）
    4. 将每个事件序列化为 WS JSON frame 发送
    5. 流结束后推送频道广播（new_message）
    """
    content = msg.get("content", "")
    session_id = msg.get("session_id", "default")
    channel_id = msg.get("channel_id", "")
    response_style = msg.get("response_style", "balanced")
    rpg_mode = msg.get("rpg_mode", False)
    memory_debug = msg.get("memory_debug", False)
    save_user_message = msg.get("save_user_message", True)

    if not content.strip():
        await ws.send_json({"type": "error", "message": "消息不能为空"})
        return

    manager = get_session_manager()
    session = manager.get_or_create(session_id)

    try:
        if rpg_mode:
            from lumen.core.environments.gm_agent import gm_chat_stream as _gm_stream
            character_id = session.character_id or "player"
            async for event in _gm_stream(
                source_id=character_id,
                action_content=content,
                session_id=session.session_id,
            ):
                await ws.send_json(event)
        else:
            async for event in agent_chat_stream(
                content, session,
                memory_debug=memory_debug,
                response_style=response_style,
                save_user_message=save_user_message,
            ):
                await ws.send_json(event)

    except Exception as e:
        logger.error(f"[WS] 聊天处理失败: {e}")
        await ws.send_json({"type": "error", "message": str(e)})

    finally:
        _clear_cancel(session.session_id)
        if rpg_mode:
            _clear_cancel(f"gm_{session.session_id}")

    # 频道广播：推送新消息通知给同频道的其他客户端
    if channel_id:
        wsm = get_ws_manager()
        await wsm.push(
            {
                "type": "new_message",
                "channel_id": channel_id,
                "session_id": session.session_id,
                "content": content[:100],  # 预览
            },
            channel_id=channel_id,
        )


async def handle_subscribe(ws: WebSocket, client_id: str, msg: dict):
    """处理 subscribe 消息"""
    channel_id = msg.get("channel_id", "")
    if channel_id:
        get_ws_manager().subscribe(client_id, channel_id)
        await ws.send_json({"type": "subscribed", "channel_id": channel_id})


async def handle_unsubscribe(ws: WebSocket, client_id: str, msg: dict):
    """处理 unsubscribe 消息"""
    channel_id = msg.get("channel_id", "")
    if channel_id:
        get_ws_manager().unsubscribe(client_id, channel_id)
        await ws.send_json({"type": "unsubscribed", "channel_id": channel_id})


async def handle_cancel(ws: WebSocket, client_id: str, msg: dict):
    """处理 cancel 消息"""
    session_id = msg.get("session_id", "default")
    request_cancel(session_id)
    await ws.send_json({"type": "cancelled", "session_id": session_id})


async def handle_writing(ws: WebSocket, client_id: str, msg: dict):
    """处理 writing 类型的 WS 消息

    两种管道：
    - chat → Agent 管道（有 persona、记忆、ReAct）
    - 其余 → 直接管道（模板渲染 + LLM，无 Agent）

    msg 字段：
        ai_mode: chat/continue/rewrite/expand/condense/beat_generate
        book_id: 作品 ID
        chapter_id: 章节 ID
        chapter_title: 章节标题
        chapter_content: 章节全文
        book_name: 作品名称
        selected_text: 编辑器选中的文字
        text_before_selection: 选区前文
        text_after_selection: 选区后文
        content: 用户输入文本
        request_id: 前端请求 ID
        beat_text / beat_context / max_words / model_id: beat_generate 专属
    """
    ai_mode = msg.get("ai_mode", "chat")
    book_id = msg.get("book_id", "")
    chapter_id = msg.get("chapter_id", "")
    chapter_title = msg.get("chapter_title", "")
    chapter_content = msg.get("chapter_content", "")
    book_name = msg.get("book_name", "")
    selected_text = msg.get("selected_text", "")
    user_input = msg.get("content", "")
    request_id = msg.get("request_id", "")
    if not book_id:
        await ws.send_json({"type": "error", "message": "未指定作品", "request_id": request_id})
        return

    try:
        if ai_mode == "chat":
            # Agent 管道：协同编辑、多轮对话
            from lumen.core.environments.writing import writing_chat_stream
            stream = writing_chat_stream(
                book_id=book_id,
                chapter_id=chapter_id,
                ai_mode=ai_mode,
                chapter_title=chapter_title,
                chapter_content=chapter_content,
                book_name=book_name,
                selected_text=selected_text,
                user_input=user_input,
            )
        else:
            # 直接管道：模板渲染 + LLM
            from lumen.core.environments.writing import direct_writing_stream
            stream = direct_writing_stream(
                ai_mode=ai_mode,
                book_id=book_id,
                chapter_id=chapter_id,
                chapter_title=chapter_title,
                chapter_content=chapter_content,
                book_name=book_name,
                selected_text=selected_text,
                text_before_selection=msg.get("text_before_selection", ""),
                text_after_selection=msg.get("text_after_selection", ""),
                beat_text=msg.get("beat_text", ""),
                beat_context=msg.get("beat_context", ""),
                max_words=msg.get("max_words"),
                model_id=msg.get("model_id", ""),
                scene_id=msg.get("scene_id", ""),
            )

        async for event in stream:
            event["request_id"] = request_id
            await ws.send_json(event)
    except Exception as e:
        logger.error(f"[WS] 写作处理失败: {e}")
        await ws.send_json({"type": "error", "message": str(e), "request_id": request_id})


async def handle_chrome_bridge_connect(ws: WebSocket, client_id: str, msg: dict):
    """Chrome 扩展连接注册"""
    bridge = get_chrome_bridge()
    await bridge.handle_connect(ws, client_id)
    await ws.send_json({"type": "chrome_bridge_connected", "client_id": client_id})
    logger.info(f"[WS] Chrome Bridge 客户端已注册: {client_id}")


def handle_chrome_bridge_result(ws: WebSocket, client_id: str, msg: dict):
    """Chrome 扩展命令执行结果"""
    bridge = get_chrome_bridge()
    bridge.handle_result(msg)


# 消息类型 → 处理函数映射
HANDLERS = {
    "chat": handle_chat,
    "subscribe": handle_subscribe,
    "unsubscribe": handle_unsubscribe,
    "cancel": handle_cancel,
    "writing": handle_writing,
    "chrome_bridge_connect": handle_chrome_bridge_connect,
    "chrome_bridge_result": handle_chrome_bridge_result,
}


async def dispatch_message(ws: WebSocket, client_id: str, raw: str):
    """解析 WS 消息并分发到对应处理器"""
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        await ws.send_json({"type": "error", "message": "无效的 JSON"})
        return

    msg_type = msg.get("type", "")
    handler = HANDLERS.get(msg_type)
    if handler:
        asyncio.create_task(handler(ws, client_id, msg))
    else:
        await ws.send_json({"type": "error", "message": f"未知消息类型: {msg_type}"})
