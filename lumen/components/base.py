"""
T24 Component 基类 — Concordia 风格可插拔组件

ContextComponent: 上下文注入（拼接 System Prompt 的各个层）
ActingComponent: 决策执行（ReAct 循环）

设计原则：
- 每个 ContextComponent 声明 priority 控制装配顺序
- 每个 ContextComponent 声明 zone 控制静态/动态分区（T29 缓存优化）
- pre_act() 返回字符串片段，由 Agent 按 priority 排序、按 zone 分组后拼接
- ActingComponent.decide() 返回 AsyncGenerator 支持 SSE 流式
"""

from abc import ABC, abstractmethod
from enum import Enum, auto
from typing import AsyncGenerator


class PromptZone(Enum):
    """组件输出分区 — 决定内容在消息列表中的位置

    STATIC:  放在 messages[0]，不变内容，前缀缓存命中
    DYNAMIC: 放在最后一条 user 消息前，每轮重建，不影响前面的缓存
    """
    STATIC = auto()
    DYNAMIC = auto()


class ContextComponent(ABC):
    """上下文组件基类

    每个组件负责拼接 System Prompt 的一个层。
    Agent.act() 按 priority 排序后依次调用 pre_act()，
    按 zone 分组后分别拼成静态区和动态区。
    """

    name: str = ""
    priority: int = 50  # 越小越靠前：Identity=10, Lore=20, Memory=30, Skills=50, Tool=90
    zone: PromptZone = PromptZone.STATIC  # 默认静态，向后兼容

    def __init__(self, name: str = "", priority: int | None = None, zone: PromptZone | None = None):
        if name:
            self.name = name
        if priority is not None:
            self.priority = priority
        if zone is not None:
            self.zone = zone
        self.last_output: str = ""

    @abstractmethod
    async def pre_act(self, context: dict) -> str:
        """返回注入到 Prompt 的字符串片段。

        Args:
            context: 共享上下文字典，包含 character、session_id 等。
                     组件可通过它读取其他组件的输出（通过 get_component_value）。

        Returns:
            要拼接到 System Prompt 的字符串。空字符串表示不注入。
        """
        ...


class ActingComponent(ABC):
    """决策组件基类

    汇总所有 ContextComponent 的输出，执行决策循环（LLM → 工具 → 结果 → 再 LLM）。
    返回 AsyncGenerator[SSEEvent dict] 以支持 SSE 流式输出（text/done/tool_start 等）。
    """

    @abstractmethod
    async def decide(
        self,
        static_prompt: str,
        dynamic_prompt: str,
        short_term_history: list[dict],
    ) -> AsyncGenerator[dict, None]:
        """汇总上下文 → 执行决策循环 → yield SSE 事件。

        Args:
            static_prompt: STATIC zone 组件的拼接输出（角色卡、工具说明等，缓存命中）
            dynamic_prompt: DYNAMIC zone 组件的拼接输出（记忆召回、知识库检索等）
            short_term_history: 短期对话历史（messages 数组中的 user/assistant 对），
                                不经过 ContextComponent，直接传给 LLM。

        Yields:
            SSEEvent dict（text/done/tool_start/tool_result/status/memory_debug）。
        """
        ...
        if False:
            yield  # noqa: unreachable — 满足类型检查
