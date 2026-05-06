"""
PlotEngine — 伏笔倒计时状态机

监听 turn.ended 做倒计时，归零时通过 HookBus 发射 plot.foreshadow.triggered。
条件触发型伏笔监听 rpg.action.completed 检查触发条件。
"""

import logging
from typing import Optional

from pydantic import BaseModel

from lumen.core.hook_bus import HookBus
from lumen.core.hook_types import (
    ForeshadowingPayload,
    RPGActionCompletedPayload,
    TurnEndedPayload,
)

logger = logging.getLogger(__name__)


class Foreshadowing(BaseModel):
    id: str
    description: str
    trigger_condition: str = ""
    countdown: int = -1
    triggered: bool = False
    campaign_id: str = ""


class PlotEngine:
    """伏笔倒计时状态机"""

    def __init__(self, hook_bus: Optional[HookBus] = None):
        self._bus = hook_bus or HookBus.get()
        self._foreshadowings: list[Foreshadowing] = []

        self._bus.register(
            "turn.ended",
            self.on_turn_ended,
            priority=90,
            name="plot_engine.on_turn_ended",
        )
        self._bus.register(
            "rpg.action.completed",
            self.check_triggers,
            priority=80,
            name="plot_engine.check_triggers",
        )

    def load_from_list(self, items: list[Foreshadowing]) -> None:
        self._foreshadowings = items
        logger.info(f"PlotEngine: loaded {len(items)} foreshadowings")

    def add(self, item: Foreshadowing) -> None:
        self._foreshadowings.append(item)

    def get_pending(self) -> list[Foreshadowing]:
        return [f for f in self._foreshadowings if not f.triggered]

    async def on_turn_ended(self, payload: TurnEndedPayload) -> None:
        """回合结束，倒计时型伏笔 -1，归零则触发"""
        for f in list(self._foreshadowings):
            if f.triggered or f.countdown <= 0:
                continue
            f.countdown -= 1
            if f.countdown == 0:
                f.triggered = True
                logger.info(f"PlotEngine: foreshadow '{f.id}' countdown reached zero")
                await self._bus.emit(
                    "plot.foreshadow.triggered",
                    ForeshadowingPayload(
                        foreshadow_id=f.id,
                        description=f.description,
                        trigger_reason="countdown",
                    ),
                )

    async def check_triggers(self, payload: RPGActionCompletedPayload) -> None:
        """检查条件触发型伏笔"""
        from simpleeval import simple_eval

        for f in list(self._foreshadowings):
            if f.triggered or not f.trigger_condition:
                continue
            ctx = {"payload": payload, "foreshadow": f}
            try:
                if simple_eval(f.trigger_condition, names=ctx):
                    f.triggered = True
                    logger.info(f"PlotEngine: foreshadow '{f.id}' condition met")
                    await self._bus.emit(
                        "plot.foreshadow.triggered",
                        ForeshadowingPayload(
                            foreshadow_id=f.id,
                            description=f.description,
                            trigger_reason="condition",
                        ),
                    )
            except Exception:
                logger.debug(f"PlotEngine: condition eval failed for '{f.id}'")
