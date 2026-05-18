"""
Chrome Bridge 连接管理器

职责：
- 管理来自 Chrome 扩展的 WebSocket 连接
- 发送命令、等待结果
- 为 tools/chrome_bridge.py 提供 execute() 接口

模式：服务层模块，管理持久连接，不依赖 core/api 层。
"""

import asyncio
import json
import logging
import time
from typing import Optional, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ChromeBridgeManager:
    """Chrome Bridge 连接管理器（单例）"""

    HEARTBEAT_INTERVAL = 30  # 秒，与 WS_HEARTBEAT_INTERVAL 一致

    def __init__(self):
        self._ws: Optional[WebSocket] = None
        self._client_id: Optional[str] = None
        self._connected: bool = False
        self._last_page_info: dict = {}
        # pending: request_id -> asyncio.Future
        self._pending: dict[str, asyncio.Future] = {}
        self._heartbeat_task: Optional[asyncio.Task] = None

    # ── 连接管理 ──

    @property
    def connected(self) -> bool:
        return self._connected and self._ws is not None

    async def handle_connect(self, ws: WebSocket, client_id: str):
        """Chrome 扩展连接"""
        self._ws = ws
        self._client_id = client_id
        self._connected = True
        # 启动心跳
        self._heartbeat_task = asyncio.create_task(
            self._heartbeat_loop(self.HEARTBEAT_INTERVAL)
        )
        logger.info(f"[ChromeBridge] ✅ Chrome 扩展已连接: {client_id}")

    def handle_disconnect(self, client_id: str):
        """Chrome 扩展断开"""
        if self._client_id == client_id:
            # 停止心跳
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
                self._heartbeat_task = None
            self._ws = None
            self._client_id = None
            self._connected = False
            # 拒绝所有等待中的命令
            for req_id, future in self._pending.items():
                if not future.done():
                    future.set_exception(ConnectionError("Chrome 扩展已断开"))
            self._pending.clear()
            logger.warning(f"[ChromeBridge] ❌ Chrome 扩展已断开: {client_id}")

    async def _heartbeat_loop(self, interval: float):
        """定期发送 ping 保持 WebSocket 连接存活"""
        try:
            while self._connected and self._ws:
                await asyncio.sleep(interval)
                if self._ws:
                    await self._ws.send_text(json.dumps({
                        "type": "ping",
                        "timestamp": int(time.time()),
                    }))
                    logger.debug("[ChromeBridge] 💓 ping")
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.debug("[ChromeBridge] 心跳循环结束")

    def handle_result(self, msg: dict):
        """处理命令执行结果"""
        request_id = msg.get("request_id", "")
        future = self._pending.pop(request_id, None)
        if future and not future.done():
            status = msg.get("status", "ok")
            data = msg.get("data", {})
            if status == "error":
                future.set_exception(RuntimeError(data.get("error", "命令执行失败")))
            else:
                future.set_result(data)
        else:
            logger.debug(f"[ChromeBridge] 收到孤立结果: {request_id}")

    def handle_page_info(self, msg: dict):
        """处理页面信息更新"""
        self._last_page_info = msg.get("data", {})
        logger.debug(f"[ChromeBridge] 📄 页面信息已更新")

    # ── 命令执行（供 tool 调用）──

    async def execute(
        self,
        command: str,
        url: str = "",
        target: str = "",
        text: str = "",
        selector: str = "",
        timeout: float = 30.0,
    ) -> dict[str, Any]:
        """向 Chrome 扩展发送命令并等待结果

        Args:
            command: navigate | screenshot | snapshot | click | type | evaluate | scroll
            url: 导航目标 URL
            target: 点击/输入的目标描述
            text: 输入的文本
            selector: CSS 选择器
            timeout: 超时秒数

        Returns:
            命令执行结果字典
        """
        if not self.connected:
            raise ConnectionError(
                "Chrome Bridge 未连接。请确保：\n"
                "1. Lumen Chrome Bridge 扩展已安装\n"
                "2. 扩展图标显示绿色 'ON'\n"
                "3. Lumen 后端正在运行"
            )

        request_id = f"cb-{int(time.time() * 1000)}-{id(command)}"

        # 构建命令消息
        cmd_msg = {
            "type": "chrome_bridge_command",
            "data": {
                "request_id": request_id,
                "command": command,
                "url": url,
                "target": target,
                "text": text,
                "selector": selector,
            },
        }

        # 创建 Future 等待结果
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self._pending[request_id] = future

        try:
            # 发送命令
            await self._ws.send_text(json.dumps(cmd_msg, ensure_ascii=False))
            logger.info(f"[ChromeBridge] 🚀 发送命令: {command}, id={request_id}")

            # 等待结果
            result = await asyncio.wait_for(future, timeout=timeout)
            logger.info(f"[ChromeBridge] ✅ 命令完成: {command}, id={request_id}")
            return result

        except asyncio.TimeoutError:
            self._pending.pop(request_id, None)
            raise TimeoutError(f"命令超时 ({timeout}s): {command}")
        except Exception:
            self._pending.pop(request_id, None)
            raise

    async def execute_chain(
        self,
        commands: list[dict[str, str]],
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        """串行执行多个命令，返回最后一个命令的结果"""
        result = None
        for i, cmd in enumerate(commands):
            is_last = (i == len(commands) - 1)
            result = await self.execute(
                command=cmd.get("command", ""),
                url=cmd.get("url", ""),
                target=cmd.get("target", ""),
                text=cmd.get("text", ""),
                selector=cmd.get("selector", ""),
                timeout=timeout,
            )
        return result

    async def get_page_info(self) -> dict:
        """获取当前页面快照（不执行操作）"""
        result = await self.execute("snapshot", timeout=10.0)
        return result

    async def navigate_and_snapshot(self, url: str) -> dict:
        """导航到 URL 并返回页面快照"""
        return await self.execute("navigate", url=url, timeout=30.0)

    async def click_and_snapshot(self, target: str = "", selector: str = "") -> dict:
        """点击元素并返回页面快照"""
        return await self.execute("click", target=target, selector=selector, timeout=15.0)

    async def type_and_snapshot(self, text: str, target: str = "", selector: str = "") -> dict:
        """输入文本并返回页面快照"""
        return await self.execute("type", text=text, target=target, selector=selector, timeout=15.0)

    async def take_screenshot(self) -> dict:
        """截取当前页面"""
        return await self.execute("screenshot", timeout=10.0)

    async def evaluate(self, script: str) -> dict:
        """在当前页面执行 JS 脚本"""
        return await self.execute("evaluate", text=script, timeout=15.0)


# ── 模块级单例 ──

_manager: Optional[ChromeBridgeManager] = None


def get_chrome_bridge() -> ChromeBridgeManager:
    """获取 ChromeBridgeManager 单例"""
    global _manager
    if _manager is None:
        _manager = ChromeBridgeManager()
    return _manager
