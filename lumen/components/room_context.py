"""
T25 RoomContextComponent — 注入当前房间的实体映射表

防御 Gemini 陷阱 1：LLM 输出"盗贼"而非 entity ID。
此组件把当前房间内所有实体的 {ID, 名字, HP} 注入 system prompt，
并明确告知 LLM 调用工具时必须使用 ID。

priority=25，排在 Lore(20) 之后、Memory(30) 之前。
"""

from lumen.components.base import ContextComponent


class RoomContextComponent(ContextComponent):
    """房间实体上下文注入 — 把实体 ID 映射表塞入 system prompt"""

    def __init__(self):
        super().__init__(name="room_context", priority=25)

    async def pre_act(self, context: dict) -> str:
        character_id = context.get("character_id", "")
        if not character_id:
            return ""

        from lumen.services import world_state as ws

        state = ws.get_agent_state(character_id)
        if not state or not state.get("room_id"):
            return ""

        room_id = state["room_id"]
        entities = ws.get_room_entities(room_id)
        if not entities:
            return ""

        room = ws.get_room(room_id)
        room_name = room.get("name", room_id) if room else room_id

        lines = [f"<room_context id=\"{room_id}\" name=\"{room_name}\">"]
        lines.append("当前房间内的实体（调用 RPG 工具时必须使用 id 字段）：")
        for e in entities:
            role = "（你）" if e["id"] == character_id else ""
            hp_info = f"HP:{e['hp']}/{e['max_hp']}" if e["hp"] < e["max_hp"] else ""
            lines.append(f"  - id: {e['id']} | 名字: {e['name']}{role} {hp_info}".rstrip())
        lines.append("</room_context>")

        return "\n".join(lines)
