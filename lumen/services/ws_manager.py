"""
Lumen - WebSocket 连接管理器
追踪活跃连接、广播推送事件、管理心跳。
单例模式，匹配 SessionManager 风格。
"""

import asyncio
import json
import logging
from typing import Optional
from datetime import datetime

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """WebSocket 连接管理器

    本地 Tauri 桌面应用，通常只有一个前端连接。
    但支持多连接，方便未来扩展（多窗口等）。
    """

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}      # client_id -> ws
        self._queues: dict[str, asyncio.Queue] = {}       # client_id -> 发送队列
        self._tasks: dict[str, asyncio.Task] = {}          # client_id -> sender 协程
        self._heartbeat_task: Optional[asyncio.Task] = None

    # ── 连接管理 ──

    async def connect(self, client_id: str, websocket: WebSocket):
        """接受新连接，启动发送协程"""
        await websocket.accept()
        self._connections[client_id] = websocket
        self._queues[client_id] = asyncio.Queue(maxsize=100)
        self._tasks[client_id] = asyncio.create_task(
            self._sender_loop(client_id)
        )
        logger.info(f"[WS] 客户端已连接: {client_id}")

        # 第一个连接时启动心跳
        if len(self._connections) == 1 and self._heartbeat_task is None:
            from lumen.config import WS_HEARTBEAT_INTERVAL
            self._heartbeat_task = asyncio.create_task(
                self._heartbeat_loop(WS_HEARTBEAT_INTERVAL)
            )

    async def disconnect(self, client_id: str):
        """清理断开的连接"""
        self._connections.pop(client_id, None)
        self._queues.pop(client_id, None)
        task = self._tasks.pop(client_id, None)
        if task:
            task.cancel()
        logger.info(f"[WS] 客户端已断开: {client_id}")

        # 全部断开后停止心跳
        if not self._connections and self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

    # ── 内部协程 ──

    async def _sender_loop(self, client_id: str):
        """每个客户端独立的发送循环：从队列取消息 → 发送"""
        try:
            while True:
                queue = self._queues.get(client_id)
                ws = self._connections.get(client_id)
                if not queue or not ws:
                    break
                message = await queue.get()
                await ws.send_text(json.dumps(message, ensure_ascii=False))
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.debug(f"[WS] 发送协程结束: {client_id}")

    async def _heartbeat_loop(self, interval: float):
        """定期广播心跳，保持连接存活"""
        try:
            while True:
                await asyncio.sleep(interval)
                await self.broadcast({
                    "type": "heartbeat",
                    "timestamp": datetime.now().isoformat(),
                })
        except asyncio.CancelledError:
            pass

    # ── 推送接口 ──

    async def push(self, event: dict):
        """广播事件给所有连接的客户端

        使用 per-client 队列避免慢消费者阻塞。
        队列满时丢弃消息（本地应用，流量极小）。
        """
        for client_id, queue in self._queues.items():
            if queue.full():
                logger.warning(f"[WS] 客户端 {client_id} 队列已满，丢弃消息")
            else:
                queue.put_nowait(event)

    async def push_to(self, client_id: str, event: dict):
        """定向推送给指定客户端"""
        queue = self._queues.get(client_id)
        if queue:
            if queue.full():
                logger.warning(f"[WS] 客户端 {client_id} 队列已满，丢弃消息")
            else:
                queue.put_nowait(event)

    async def broadcast(self, event: dict):
        """push() 的别名"""
        await self.push(event)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# ── 模块级单例 ──

_manager: Optional[WebSocketManager] = None


def get_ws_manager() -> WebSocketManager:
    """获取 WebSocketManager 单例"""
    global _manager
    if _manager is None:
        _manager = WebSocketManager()
    return _manager
