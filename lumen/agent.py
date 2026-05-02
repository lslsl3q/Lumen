"""
T24 Agent 容器 — 持有组件列表、信箱、状态

Agent 是 Component 的容器。它：
1. 按 priority 排序所有 ContextComponent
2. 依次调用 pre_act() 收集上下文
3. 交给 ActingComponent.decide() 执行决策
4. 返回 AsyncGenerator 支持 SSE 流式

架构兼容性（T25 准备）：
- mailbox: asyncio.Queue — 未来多 Agent 通信时接收消息
- state: dict — 未来 CognitiveStateComponent 等组件共享状态
- set_migration_target() — 未来切换 Environment 时平滑迁移
"""

import asyncio
import logging
from typing import AsyncGenerator, Optional

from lumen.components.base import ContextComponent, ActingComponent, PromptZone
from lumen.types.agent_message import AgentMessage

logger = logging.getLogger(__name__)


class Agent:
    """Agent 容器：持有组件列表、信箱、状态。"""

    def __init__(self, agent_id: str):
        self.id = agent_id
        self.components: list[ContextComponent] = []
        self.act_component: Optional[ActingComponent] = None
        self.mailbox: asyncio.Queue[AgentMessage] = asyncio.Queue()
        self.state: dict = {}

        self._migration_target: Optional["Agent"] = None

    # ── 组件管理 ──

    def add_component(self, component: ContextComponent) -> None:
        self.components.append(component)

    def remove_component(self, component_type: type) -> None:
        self.components = [
            c for c in self.components if not isinstance(c, component_type)
        ]

    def get_component(self, component_type: type) -> Optional[ContextComponent]:
        for c in self.components:
            if isinstance(c, component_type):
                return c
        return None

    def get_component_value(self, name: str) -> str | None:
        """Concordia 风格的组件间通信：按 name 查找组件的 last_output"""
        for c in self.components:
            if c.name == name:
                return c.last_output
        return None

    def _sorted_components(self) -> list[ContextComponent]:
        """按 priority 排序的组件列表"""
        return sorted(self.components, key=lambda c: c.priority)

    # ── 核心循环 ──

    async def act(self, context: dict, short_term_history: list[dict]) -> AsyncGenerator[dict, None]:
        """收集所有组件上下文 → ActingComponent 决策 → 流式输出

        Args:
            context: 共享上下文（character dict、session_id 等）
            short_term_history: 短期对话历史（不经过 Component，直接传给 decide）

        Yields:
            SSEEvent dict（text/done/tool_start/tool_result/status/memory_debug）
        """
        # 1. 收集上下文，按 zone 分组
        static_outputs: list[str] = []
        dynamic_outputs: list[str] = []
        for component in self._sorted_components():
            try:
                output = await component.pre_act(context)
                component.last_output = output
                if not output:
                    continue
                if component.zone == PromptZone.STATIC:
                    static_outputs.append(output)
                else:
                    dynamic_outputs.append(output)
            except Exception as e:
                logger.error(f"Component {component.name}.pre_act() 失败: {e}")

        # 2. 拼接
        static_prompt = "\n\n".join(static_outputs)
        dynamic_prompt = "\n\n".join(dynamic_outputs)

        # 3. 交给 ActingComponent
        if self.act_component is None:
            raise RuntimeError(f"Agent {self.id} 没有 ActingComponent")

        async for token in self.act_component.decide(
            static_prompt, dynamic_prompt, short_term_history
        ):
            yield token

    # ── 消息 ──

    async def receive(self, msg: dict) -> None:
        """消息进信箱（T25 多 Agent 通信时使用）"""
        await self.mailbox.put(msg)

    # ── 迁移（T25 准备）──

    def set_migration_target(self, target: "Agent") -> None:
        self._migration_target = target

    async def wait_for_idle(self, timeout: float = 30.0) -> None:
        """等待当前任务完成（mailbox 为空且没有正在执行的 act）"""
        try:
            await asyncio.wait_for(self.mailbox.join(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Agent {self.id} wait_for_idle 超时 ({timeout}s)")
