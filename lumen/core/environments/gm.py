"""
T25 GMEnvironment — RPG 跑团 DM 环境

4 步裁决链：
1. 拦截/初筛（零 Token）— 斜杠指令直接执行，非法行动拒绝
2. 工具判定（零/低 Token）— 掷骰、属性检定、战斗结算
3. LLM 叙事（高 Token）— GM Agent ReAct 循环生成裁决和叙事
4. 广播（零 Token）— 向同一房间的 Agent 投递观察消息

意图提取策略（混合模式）：
- 斜杠指令（/roll, /move, /attack, /check）→ 直接调用工具，零 Token
- 自然语言 → 交给 GM Agent 的 ReAct 循环（LLM 自己决定是否调工具）
- 不需要单独的 Intent Parser，ReAct 本身就是意图解析器

降级策略：
- 第 2 步（数值判定）成功后，状态已变更
- 第 3 步（LLM 叙事）失败时绝不回滚，走降级广播
- 降级广播：把工具结果直接转为系统文本发出
"""

import asyncio
import logging
import re
from typing import AsyncGenerator, Optional

from lumen.core.environments.base import BaseEnvironment
from lumen.core.hook_bus import HookBus
from lumen.core.hook_types import (
    RPGActionBeforePayload,
    RPGActionCompletedPayload,
    TurnEndedPayload,
)
from lumen.types.agent_message import AgentMessage, MsgType

logger = logging.getLogger(__name__)


# ── 斜杠指令解析 ──

_SLASH_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^/roll\s+(.+)$", re.I), "dice"),
    (re.compile(r"^/move\s+(\S+)", re.I), "rpg.move_to"),
    (re.compile(r"^/attack\s+(\S+)", re.I), "rpg.resolve_attack"),
    (re.compile(r"^/check\s+(\S+)(?:\s+(\d+))?$", re.I), "rpg.roll_check"),
    (re.compile(r"^/look\s*$", re.I), "rpg.look"),
]


def _parse_slash(text: str) -> Optional[tuple[str, dict]]:
    """解析斜杠指令，返回 (tool_command, params) 或 None"""
    text = text.strip()
    if not text.startswith("/"):
        return None

    for pattern, tool_cmd in _SLASH_PATTERNS:
        m = pattern.match(text)
        if not m:
            continue

        if tool_cmd == "dice":
            return ("dice", {"expression": m.group(1)})

        if tool_cmd == "rpg.move_to":
            return ("rpg.move_to", {"room_id": m.group(1)})

        if tool_cmd == "rpg.resolve_attack":
            return ("rpg.resolve_attack", {"target_id": m.group(1)})

        if tool_cmd == "rpg.roll_check":
            params = {"attribute": m.group(1)}
            if m.group(2):
                params["difficulty"] = int(m.group(2))
            return ("rpg.roll_check", params)

        if tool_cmd == "rpg.look":
            return ("rpg.look", {})

    return None


async def _execute_tool_directly(command: str, params: dict) -> dict:
    """直接调用工具（绕过 LLM，零 Token）"""
    from lumen.tool import set_tool_context, execute_tool

    def _on_room_move(agent_id, old_room, new_room):
        try:
            from lumen.core.message_bus import get_message_bus
            bus = get_message_bus()
            if bus and bus.is_registered(agent_id):
                if old_room:
                    bus.leave_room(old_room, agent_id)
                bus.join_room(new_room, agent_id)
        except Exception:
            pass

    set_tool_context(character_id=params.get("agent_id", ""),
                     on_room_move=_on_room_move)

    if command == "dice":
        from lumen.tools.dice import execute
        return execute(params)

    if command.startswith("rpg."):
        rpg_command = command[4:]  # "move_to" / "resolve_attack" / "roll_check"
        from lumen.tools.rpg import execute
        return await execute(params, command=rpg_command)

    return {"success": False, "error_message": f"未知指令: {command}"}


def _degraded_narrative(tool_result: dict, action_type: str) -> str:
    """降级叙事 — 把工具结果转为系统播报（LLM 失败时使用）"""
    if not tool_result.get("success"):
        return f"[系统] 操作失败: {tool_result.get('error_message', '未知错误')}"

    data = tool_result.get("data", {})
    if "message" in data:
        return data["message"]

    # 通用兜底：把关键数据格式化
    tool = tool_result.get("tool", action_type)
    if "total" in data and "rolls" in data:
        return f"[{tool}] {data.get('expression', '')}: {data['rolls']} = {data['total']}"

    return f"[{tool}] 执行完成"


class GMEnvironment(BaseEnvironment):
    """RPG DM 环境：4 步裁决链 + 斜杠指令 + 降级广播"""

    def __init__(self, message_bus, world_state):
        super().__init__(message_bus)
        self.world_state = world_state

    # ── 主入口 ──

    async def process_message(
        self,
        source_id: str,
        target_id: str | None,
        msg: AgentMessage,
    ) -> AsyncGenerator[dict, None]:
        """处理玩家消息，yield SSE 事件"""
        content = msg.get("content", "")
        if not content:
            return

        # Step 0: 斜杠指令 → 直接执行，零 Token
        slash = _parse_slash(content)
        if slash:
            async for event in self._handle_slash(source_id, slash[0], slash[1]):
                yield event
            return

        # Step 1: 规则初筛（零 Token）
        validation = self._validate_action(source_id, msg)
        if not validation["ok"]:
            yield {"type": "text", "content": validation["reason"]}
            yield {"type": "done", "exit_reason": "rejected"}
            return

        # Step 2-3: 自然语言 → GM Agent
        async for event in self._relay_to_gm(source_id, msg):
            yield event

    # ── 斜杠指令处理（Step 0）──

    async def _handle_slash(
        self, source_id: str, command: str, params: dict
    ) -> AsyncGenerator[dict, None]:
        """斜杠指令：直接调工具 → 生成叙事 → yield SSE 事件"""
        params["agent_id"] = source_id

        # 执行工具
        try:
            result = await _execute_tool_directly(command, params)
        except Exception as e:
            logger.error(f"斜杠指令执行失败: {command}, {e}")
            result = {"success": False, "error_message": str(e)}

        narrative = _degraded_narrative(result, command)

        # 工具结果事件
        yield {
            "type": "tool_result",
            "tool": command,
            "success": result.get("success", False),
            "data": result.get("data"),
        }

        # 叙事文本事件
        yield {"type": "text", "content": narrative}

        # RPG 状态快照
        if result.get("success"):
            async for evt in self._yield_room_state(source_id):
                yield evt

        # 广播观察给同房间其他 Agent
        await self._broadcast_observation(source_id, narrative, result)

        # 记录事件
        state = self.world_state.get_agent_state(source_id)
        room_id = state.get("room_id", "") if state else ""
        if room_id:
            self.world_state.record_event(room_id, source_id, "action", f"/{command}")
            self.world_state.record_event(room_id, "gm", "narrative", narrative[:100])

        # HookBus: 斜杠指令完成 + 回合结束
        bus = HookBus.get()
        await bus.emit(
            "rpg.action.completed",
            RPGActionCompletedPayload(
                action_type=command,
                actor_id=source_id,
                room_id=room_id,
                result_text=narrative[:200],
            ),
        )
        await bus.emit("turn.ended", TurnEndedPayload())

        yield {"type": "done", "exit_reason": "slash_command"}

    # ── 规则初筛（Step 1）──

    def _validate_action(self, source_id: str, msg: AgentMessage) -> dict:
        """零 Token 初筛：检查 Agent 是否存在、是否在合法位置"""
        state = self.world_state.get_agent_state(source_id)
        if not state:
            return {"ok": False, "reason": f"Agent {source_id} 未注册到世界"}

        if not state.get("room_id"):
            return {"ok": False, "reason": "Agent 不在任何房间中，请先移动到一个房间"}

        return {"ok": True}

    # ── GM Agent 裁决（Step 2-3）──

    async def _relay_to_gm(
        self, source_id: str, msg: AgentMessage
    ) -> AsyncGenerator[dict, None]:
        """自然语言 → GM Agent ReAct → 叙事 SSE 流"""
        from lumen.core.environments.gm_agent import gm_chat_stream

        content = msg.get("content", "")

        # HookBus: GM 裁决前触发
        state = self.world_state.get_agent_state(source_id)
        room_id = state.get("room_id", "") if state else ""
        await HookBus.get().emit(
            "rpg.action.before",
            RPGActionBeforePayload(
                character_id=source_id,
                user_input=content,
                room_id=room_id,
            ),
        )

        # 获取 session_id（从 metadata 传入，或用空字符串）
        session_id = msg.get("metadata", {}).get("session_id", "")

        async for event in gm_chat_stream(
            source_id=source_id,
            action_content=content,
            session_id=session_id,
        ):
            yield event

        # GM 完成后，异步广播观察给同房间 NPC
        state = self.world_state.get_agent_state(source_id)
        if state and state.get("room_id"):
            room_id = state["room_id"]

            # HookBus: 动作完成 + 回合结束
            bus = HookBus.get()
            await bus.emit(
                "rpg.action.completed",
                RPGActionCompletedPayload(
                    action_type="natural_language",
                    actor_id=source_id,
                    room_id=room_id,
                    result_text=content[:200],
                ),
            )
            await bus.emit(
                "turn.ended",
                TurnEndedPayload(session_id=session_id),
            )

            async def _safe_broadcast():
                try:
                    await self.message_bus.broadcast(room_id, {
                        "type": MsgType.OBSERVATION,
                        "sender_id": source_id,
                        "room_id": room_id,
                        "content": content,
                    })
                except Exception as e:
                    logger.error(f"NPC 广播失败: {e}")

            task = asyncio.create_task(_safe_broadcast())
            task.add_done_callback(
                lambda t: t.exception() if not t.cancelled() else None
            )

    # ── RPG 状态快照 ──

    async def _yield_room_state(
        self, source_id: str
    ) -> AsyncGenerator[dict, None]:
        """yield rpg_state SSE 事件"""
        try:
            state = self.world_state.get_agent_state(source_id)
            if not state or not state.get("room_id"):
                return
            room_id = state["room_id"]
            room = self.world_state.get_room(room_id)
            entities = self.world_state.get_room_entities(room_id)
            yield {
                "type": "rpg_state",
                "room_id": room_id,
                "room_name": room.get("name", room_id) if room else room_id,
                "entities": entities,
            }
        except Exception as e:
            logger.debug(f"rpg_state 生成跳过: {e}")

    # ── 广播观察（Step 4）──

    async def _broadcast_observation(
        self,
        source_id: str,
        narrative: str,
        tool_result: dict,
    ) -> None:
        """向同房间的其他 Agent 广播观察消息"""
        state = self.world_state.get_agent_state(source_id)
        if not state:
            return

        room_id = state.get("room_id", "")
        if not room_id:
            return

        occupants = self.world_state.list_agents_in_room(room_id)
        observers = [a for a in occupants if a != source_id]

        for observer_id in observers:
            await self.message_bus.send_to(observer_id, {
                "type": MsgType.OBSERVATION,
                "sender_id": source_id,
                "room_id": room_id,
                "content": narrative,
                "metadata": {"tool_result": tool_result},
            })
