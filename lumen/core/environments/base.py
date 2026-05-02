"""
T25 BaseEnvironment — 所有模式的基础环境

Environment 是 Agent 的"世界"：它定义消息如何流转、
状态如何变更、Agent 如何感知周围发生的事。

当前只有 Chat（透传）和 GM（RPG）两种环境，
未来可扩展 Workbench / Writing / HomeBase。
"""

from abc import ABC, abstractmethod

from lumen.core.message_bus import MessageBus
from lumen.types.agent_message import AgentMessage


class BaseEnvironment(ABC):
    """模式环境基类"""

    def __init__(self, message_bus: MessageBus):
        self.message_bus = message_bus
        self.agents: dict[str, object] = {}  # agent_id → Agent

    def register_agent(self, agent) -> None:
        """注册 Agent 到本环境"""
        self.agents[agent.id] = agent
        self.message_bus.register(agent.id)

    def unregister_agent(self, agent_id: str) -> None:
        """从本环境移除 Agent"""
        self.agents.pop(agent_id, None)
        self.message_bus.unregister(agent_id)

    @abstractmethod
    async def process_message(
        self,
        source_id: str,
        target_id: str | None,
        msg: AgentMessage,
    ) -> None:
        """处理消息 — 子类实现具体路由逻辑"""
        ...
