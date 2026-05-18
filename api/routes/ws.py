"""
WebSocket 双向通信端点（T26: 全面替代 SSE）

聊天流、频道订阅、取消请求、系统推送全部走此单一 WS 连接。
"""

import logging
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from lumen.services.ws_manager import get_ws_manager
from lumen.services.chrome_bridge import get_chrome_bridge
from api.routes.ws_handler import dispatch_message

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("")
async def ws_endpoint(websocket: WebSocket):
    """WebSocket 主端点 — 访问路径: ws://host:port/ws

    客户端→服务端消息类型：
      - chat:      发送聊天消息，启动 AI 流式回复
      - writing:   写作模式 AI 请求（续写/润色/扩写/精简/对话）
      - cancel:    取消当前生成
      - subscribe:   订阅频道（接收推送）
      - unsubscribe: 取消订阅频道

    服务端→客户端消息类型：
      - text/tool_start/tool_result/done/error: AI 流式回复
      - new_message: 频道内其他客户端的消息推送
      - heartbeat: 定期保活
    """
    manager = get_ws_manager()
    client_id = f"ws-{uuid.uuid4().hex[:8]}"

    await manager.connect(client_id, websocket)
    logger.info(f"[WS] 客户端已连接: {client_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            await dispatch_message(websocket, client_id, raw)
    except WebSocketDisconnect:
        logger.info(f"[WS] 客户端 {client_id} 正常断开")
    except Exception as e:
        logger.error(f"[WS] 客户端 {client_id} 异常: {e}")
    finally:
        await manager.disconnect(client_id)
        get_chrome_bridge().handle_disconnect(client_id)
