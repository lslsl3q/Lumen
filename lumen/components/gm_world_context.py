"""GM Agent 世界上下文组件 — 注入房间状态 + 实体 + 近期事件"""

import logging

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)


class GMWorldContextComponent(ContextComponent):
    """世界状态快照 + 近期事件摘要（DYNAMIC，每轮重建）"""

    def __init__(self):
        super().__init__(
            name="gm_world_context",
            priority=30,
            zone=PromptZone.DYNAMIC,
        )

    async def pre_act(self, context: dict) -> str:
        source_id = context.get("source_id", "")
        world_state = context.get("world_state")
        if not world_state or not source_id:
            return ""

        parts = []

        # 当前房间
        state = world_state.get_agent_state(source_id)
        if state:
            room_id = state.get("room_id", "")
            room = world_state.get_room(room_id)
            room_name = room.get("name", room_id) if room else room_id

            # 玩家状态
            hp = state.get("hp", "?")
            max_hp = state.get("max_hp", "?")
            parts.append(f"## 玩家状态\n- HP: {hp}/{max_hp} | 位置：{room_name}\n")

            # 房间实体
            entities = world_state.get_room_entities(room_id)
            if entities:
                entity_lines = []
                for e in entities:
                    if e["id"] == source_id:
                        continue
                    name = e.get("name", e["id"])
                    ehp = e.get("hp", "?")
                    emhp = e.get("max_hp", "?")
                    entity_lines.append(f"- {name}（HP: {ehp}/{emhp}）")
                if entity_lines:
                    parts.append("## 房间实体\n" + "\n".join(entity_lines) + "\n")

            # 近期事件
            events = world_state.get_recent_events(room_id, limit=5)
            if events:
                event_lines = [f"{i+1}. [{e['event_type']}] {e['summary']}" for i, e in enumerate(events)]
                parts.append("## 近期事件\n" + "\n".join(event_lines) + "\n")

        return "\n".join(parts)
