"""
WebSocket 推送通道端点
AI 主动推送消息走这里。
不替代现有的 HTTP+SSE 聊天流程。
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from lumen.services.ws_manager import get_ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/push")
async def websocket_push(websocket: WebSocket):
    """WebSocket 推送通道

    前端启动时连接，接收：
    - heartbeat: 定期心跳保活
    - ai_message: AI 主动消息
    - notification: 任务通知
    - system: 系统状态

    连接生命周期：
    1. 前端打开 ws://127.0.0.1:8888/ws/push
    2. 后端 accept，分配 client_id
    3. 心跳保持连接存活
    4. 断开时后端清理，前端自动重连
    """
    manager = get_ws_manager()
    client_id = str(id(websocket))

    await manager.connect(client_id, websocket)

    try:
        while True:
            # 主要是推送通道，正常不接收前端消息
            # 但保留 receive 循环，未来可扩展双向通信
            data = await websocket.receive_text()
            logger.debug(f"[WS] 收到客户端消息: {data}")
    except WebSocketDisconnect:
        logger.info(f"[WS] 客户端 {client_id} 正常断开")
    except Exception as e:
        logger.error(f"[WS] 客户端 {client_id} 异常: {e}")
    finally:
        await manager.disconnect(client_id)
