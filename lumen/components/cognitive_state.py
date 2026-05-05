"""GM/NPC 认知状态组件 — 注入当前心理状态（goals/attention/emotions）

TinyTroupe 启发：每次行动后 LLM 自动更新四维状态，使 Agent 行为有连续性。
优先级 35，插在 world_context(30) 和 resolution(50) 之间。
"""

import logging

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)


class CognitiveStateComponent(ContextComponent):
    """认知状态注入 — GM/NPC 的当前心理状态（DYNAMIC，每轮重建）"""

    def __init__(self):
        super().__init__(
            name="cognitive_state",
            priority=35,
            zone=PromptZone.DYNAMIC,
        )

    async def pre_act(self, context: dict) -> str:
        source_id = context.get("source_id", "")
        world_state = context.get("world_state")
        if not world_state or not source_id:
            return ""

        state = world_state.get_cognitive_state(source_id)
        if not state:
            return ""

        lines = ["## DM 当前认知状态"]

        attention = state.get("attention", "")
        if attention:
            lines.append(f"- 关注焦点：{attention}")

        goals = state.get("goals", [])
        if goals:
            lines.append(f"- 当前目标：{'、'.join(goals)}")

        emotions = state.get("emotions", {})
        if emotions:
            parts = [f"{k}({v:.0%})" for k, v in emotions.items()]
            lines.append(f"- 情绪状态：{'、'.join(parts)}")

        # T26: 语义组实时情绪分数
        emotion_scores = state.get("emotion_scores", {})
        if emotion_scores:
            top3 = sorted(emotion_scores.items(), key=lambda x: x[1], reverse=True)[:3]
            parts2 = [f"{k}({v:.0%})" for k, v in top3]
            lines.append(f"- 实时情绪：{'、'.join(parts2)}")

        ctx = state.get("context_summary", "")
        if ctx:
            lines.append(f"- 最近印象：{ctx}")

        logger.debug("GM 认知状态已注入: attention=%s, goals=%d",
                     attention, len(goals))
        return "\n".join(lines) + "\n"
