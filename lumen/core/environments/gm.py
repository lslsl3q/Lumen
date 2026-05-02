"""
T25 GMEnvironment — RPG 跑团 DM 环境

4 步裁决链：
1. 拦截/初筛（零 Token）— 斜杠指令直接执行，非法行动拒绝
2. 工具判定（零/低 Token）— 掷骰、属性检定、战斗结算
3. LLM 叙事（高 Token）— 生成 DM 描述文本
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

import re
import logging
from typing import Optional

from lumen.core.environments.base import BaseEnvironment
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

    set_tool_context(character_id=params.get("agent_id", ""))

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
    ) -> None:
        content = msg.get("content", "")
        if not content:
            return

        # Step 0: 斜杠指令 → 直接执行，零 Token
        slash = _parse_slash(content)
        if slash:
            await self._handle_slash(source_id, slash[0], slash[1])
            return

        # Step 1: 规则初筛（零 Token）
        validation = self._validate_action(source_id, msg)
        if not validation["ok"]:
            await self.message_bus.send_to(source_id, {
                "type": MsgType.SYSTEM,
                "sender_id": "gm",
                "content": validation["reason"],
            })
            return

        # Step 2-3: 自然语言 → 交给 GM Agent 的 ReAct 循环
        # （GM Agent 有 RPG 工具可用，LLM 自己决定是否调工具）
        # 注：当前 MVP 阶段走简化路径，直接广播玩家消息
        # 完整版会创建 GM Agent 并走 agent.act()
        await self._relay_to_gm(source_id, msg)

    # ── 斜杠指令处理（Step 0）──

    async def _handle_slash(self, source_id: str, command: str, params: dict) -> None:
        """斜杠指令：直接调工具 → 生成叙事 → 广播"""
        params["agent_id"] = source_id

        # 执行工具
        try:
            result = await _execute_tool_directly(command, params)
        except Exception as e:
            logger.error(f"斜杠指令执行失败: {command}, {e}")
            result = {"success": False, "error_message": str(e)}

        # 生成叙事（降级模式：直接用工具结果文本）
        narrative = _degraded_narrative(result, command)

        # 发送结果给执行者
        await self.message_bus.send_to(source_id, {
            "type": MsgType.SYSTEM,
            "sender_id": "gm",
            "content": narrative,
            "metadata": {"tool_result": result, "slash_command": command},
        })

        # 广播观察给同房间的其他 Agent
        await self._broadcast_observation(source_id, narrative, result)

    # ── 规则初筛（Step 1）──

    def _validate_action(self, source_id: str, msg: AgentMessage) -> dict:
        """零 Token 初筛：检查 Agent 是否存在、是否在合法位置"""
        state = self.world_state.get_agent_state(source_id)
        if not state:
            return {"ok": False, "reason": f"Agent {source_id} 未注册到世界"}

        if not state.get("room_id"):
            return {"ok": False, "reason": "Agent 不在任何房间中，请先移动到一个房间"}

        return {"ok": True}

    # ── 消息中继（Step 2-3，MVP 简化版）──

    async def _relay_to_gm(self, source_id: str, msg: AgentMessage) -> None:
        """将玩家消息广播给同房间的其他 Agent

        完整版会：
        1. 创建/获取 GM Agent
        2. GM Agent.act() 通过 ReAct 循环处理消息
        3. GM 可能调用 RPG 工具
        4. GM 生成叙事
        5. 叙事广播给观察者
        """
        content = msg.get("content", "")
        state = self.world_state.get_agent_state(source_id)
        if not state:
            return

        room_id = state.get("room_id", "")

        # 广播玩家行动给同房间其他 Agent（观察消息）
        await self.message_bus.broadcast(room_id, {
            "type": MsgType.OBSERVATION,
            "sender_id": source_id,
            "room_id": room_id,
            "content": content,
        })

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
