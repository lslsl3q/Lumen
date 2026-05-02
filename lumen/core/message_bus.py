"""
T25 MessageBus — 多 Agent 通信的消息总线

两个原语：send_to（点对点）+ broadcast（房间广播）。
基于 asyncio.Queue 信箱模型，与 Agent.mailbox 对齐。

设计决策：
- 不继承 events/bus.py（那是 pub/sub 事件模型，Agent 通信是信箱模型）
- 内存态，无持久化（Agent 消息是瞬时的，不需要落盘）
- 全局单例（一个应用只有一个 MessageBus）
"""

import asyncio
import logging
from typing import Optional

from lumen.types.agent_message import AgentMessage

logger = logging.getLogger(__name__)


class MessageBus:
    """内存消息总线 — 点对点 + 房间广播"""

    def __init__(self):
        self._mailboxes: dict[str, asyncio.Queue[AgentMessage]] = {}
        self._rooms: dict[str, set[str]] = {}  # room_id → member_ids

    # ── 注册/注销 ──

    def register(self, agent_id: str) -> asyncio.Queue[AgentMessage]:
        """注册 Agent，返回其专属信箱 Queue。

        Agent 启动时调用，拿到 Queue 后自行消费。
        """
        if agent_id in self._mailboxes:
            logger.warning(f"Agent {agent_id} 重复注册，复用已有信箱")
            return self._mailboxes[agent_id]

        q: asyncio.Queue[AgentMessage] = asyncio.Queue()
        self._mailboxes[agent_id] = q
        return q

    def unregister(self, agent_id: str) -> None:
        """注销 Agent，清空信箱并移除所有房间成员关系"""
        self._mailboxes.pop(agent_id, None)
        for members in self._rooms.values():
            members.discard(agent_id)

    # ── 房间管理 ──

    def join_room(self, room_id: str, agent_id: str) -> None:
        """Agent 加入房间"""
        if room_id not in self._rooms:
            self._rooms[room_id] = set()
        self._rooms[room_id].add(agent_id)

    def leave_room(self, room_id: str, agent_id: str) -> None:
        """Agent 离开房间"""
        if room_id in self._rooms:
            self._rooms[room_id].discard(agent_id)
            if not self._rooms[room_id]:
                del self._rooms[room_id]

    def get_room_members(self, room_id: str) -> set[str]:
        """获取房间内的所有 Agent ID"""
        return set(self._rooms.get(room_id, set()))

    # ── 消息投递 ──

    async def send_to(self, agent_id: str, msg: AgentMessage) -> None:
        """点对点投递消息到目标 Agent 的信箱"""
        mailbox = self._mailboxes.get(agent_id)
        if mailbox is None:
            logger.warning(f"send_to: Agent {agent_id} 未注册，消息丢弃")
            return
        await mailbox.put(msg)

    async def broadcast(self, room_id: str, msg: AgentMessage) -> None:
        """向房间内所有成员广播消息（发送者也会收到，需自行过滤）"""
        members = self._rooms.get(room_id, set())
        if not members:
            logger.debug(f"broadcast: 房间 {room_id} 无成员")
            return

        sender_id = msg.get("sender_id")
        for member_id in members:
            # 默认不回投给自己（可用 metadata["echo"] = True 覆盖）
            if member_id == sender_id and not msg.get("metadata", {}).get("echo"):
                continue
            await self._mailboxes[member_id].put(msg)

    async def broadcast_all(self, msg: AgentMessage) -> None:
        """向所有已注册 Agent 广播（无房间概念，如系统公告）"""
        sender_id = msg.get("sender_id")
        for agent_id, mailbox in self._mailboxes.items():
            if agent_id == sender_id:
                continue
            await mailbox.put(msg)

    # ── 查询 ──

    def get_registered_agents(self) -> list[str]:
        """返回所有已注册的 Agent ID"""
        return list(self._mailboxes.keys())

    def is_registered(self, agent_id: str) -> bool:
        return agent_id in self._mailboxes


# ── 全局单例 ──

_bus: Optional[MessageBus] = None


def get_message_bus() -> MessageBus:
    """获取全局 MessageBus 单例"""
    global _bus
    if _bus is None:
        _bus = MessageBus()
    return _bus
