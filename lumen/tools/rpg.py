"""
工具：rpg — RPG 游戏动作工具集

三个命令：
- move_to: Agent 移动到新房间（WorldState + MessageBus 联动）
- roll_check: 属性检定（掷骰 + 属性值）
- resolve_attack: 战斗判定（命中 + 伤害 + HP 更新）

所有状态变更通过 WorldStateService（SQLite）。
move_to 额外联动 MessageBus 房间订阅。
"""

import logging
import asyncio

from lumen.tool import success_result, error_result, ErrorCode, get_tool_context

logger = logging.getLogger(__name__)


def _get_agent_id() -> str:
    """从工具上下文获取当前 Agent ID（character_id）"""
    ctx = get_tool_context()
    return ctx.get("character_id", "")


def _ensure_world_state():
    from lumen.services import world_state
    return world_state


def _get_message_bus():
    from lumen.core.message_bus import get_message_bus
    return get_message_bus()


def _resolve_target(id_or_name: str, room_id: str = "") -> str | None:
    """解析目标标识：先当 ID，再当名字（Gemini 陷阱 1 防御）"""
    ws = _ensure_world_state()
    return ws.resolve_agent_id(id_or_name, room_id)


# ── move_to ──

async def _move_to(params: dict) -> dict:
    """Agent 移动到新房间"""
    agent_raw = params.get("agent_id") or _get_agent_id()
    target_room = params.get("room_id", "").strip()

    if not agent_raw:
        return error_result("rpg", ErrorCode.PARAM_EMPTY, "缺少 agent_id")
    if not target_room:
        return error_result("rpg", ErrorCode.PARAM_EMPTY, "缺少目标 room_id")

    ws = _ensure_world_state()
    agent_id = ws.resolve_agent_id(agent_raw) or agent_raw

    # 确保 Agent 和目标房间存在
    state = ws.ensure_agent(agent_id)
    old_room = state["room_id"]
    ws.ensure_room(target_room)

    if old_room == target_room:
        return success_result("rpg", {
            "action": "move_to",
            "agent_id": agent_id,
            "room_id": target_room,
            "message": f"已在 {target_room} 中，无需移动",
        })

    # 更新 WorldState
    ws.update_agent(agent_id, room_id=target_room)

    # 联动 MessageBus 房间订阅
    try:
        bus = _get_message_bus()
        if bus.is_registered(agent_id):
            if old_room:
                bus.leave_room(old_room, agent_id)
            bus.join_room(target_room, agent_id)
    except Exception as e:
        logger.warning(f"MessageBus 房间联动失败（不影响移动）: {e}")

    # 查看新房间里的其他 Agent
    occupants = ws.list_agents_in_room(target_room)
    others = [a for a in occupants if a != agent_id]

    logger.info(f"Agent {agent_id}: {old_room} → {target_room}")

    return success_result("rpg", {
        "action": "move_to",
        "agent_id": agent_id,
        "from_room": old_room,
        "to_room": target_room,
        "occupants": others,
        "message": f"已从 {old_room} 移动到 {target_room}" + (f"，这里有: {', '.join(others)}" if others else ""),
    })


# ── roll_check ──

async def _roll_check(params: dict) -> dict:
    """属性检定：掷 1d20 + 属性值 vs 难度"""
    from lumen.tools.dice import _roll

    agent_id = params.get("agent_id") or _get_agent_id()
    attr_name = params.get("attribute", "str").strip().lower()
    difficulty = params.get("difficulty", 10)
    try:
        difficulty = int(difficulty)
    except (ValueError, TypeError):
        return error_result("rpg", ErrorCode.PARAM_TYPE, "difficulty 须为整数")

    if not agent_id:
        return error_result("rpg", ErrorCode.PARAM_EMPTY, "缺少 agent_id")

    ws = _ensure_world_state()
    state = ws.ensure_agent(agent_id)
    attr_value = state["attrs"].get(attr_name, 10)

    # 掷 1d20 + 属性修正（D&D 风格：(attr - 10) // 2）
    roll = _roll(1, 20, 0)
    modifier = (attr_value - 10) // 2
    total = roll["total"] + modifier
    success = total >= difficulty

    return success_result("rpg", {
        "action": "roll_check",
        "agent_id": agent_id,
        "attribute": attr_name,
        "attr_value": attr_value,
        "modifier": modifier,
        "roll": roll["rolls"][0],
        "total": total,
        "difficulty": difficulty,
        "success": success,
        "message": f"检定 {attr_name}({attr_value}): 掷出 {roll['rolls'][0]} + {modifier} = {total} vs DC{difficulty} → {'成功' if success else '失败'}",
    })


# ── resolve_attack ──

async def _resolve_attack(params: dict) -> dict:
    """战斗判定：攻击掷骰 → 命中判定 → 伤害掷骰 → HP 更新"""
    from lumen.tools.dice import _roll

    attacker_id = params.get("attacker_id") or _get_agent_id()
    target_raw = params.get("target_id", "").strip()
    attack_attr = params.get("attack_attr", "str")
    defense_attr = params.get("defense_attr", "dex")
    damage_dice = params.get("damage_dice", "1d6")

    if not attacker_id or not target_raw:
        return error_result("rpg", ErrorCode.PARAM_EMPTY, "需要 attacker_id 和 target_id")

    ws = _ensure_world_state()

    # 名字→ID 解析（防御 Gemini 陷阱 1：LLM 可能输出名字而非 ID）
    attacker_id = ws.resolve_agent_id(attacker_id) or attacker_id
    target_id = _resolve_target(target_raw)
    if not target_id:
        return error_result(
            "rpg", ErrorCode.PARAM_INVALID,
            f"找不到目标: {target_raw}",
            {"hint": "使用实体 ID 或名称，可通过 /look 查看当前房间实体"},
        )

    attacker = ws.ensure_agent(attacker_id)
    target = ws.ensure_agent(target_id)

    # 1. 攻击检定（1d20 + 攻击属性修正 vs 目标 AC = 10 + 防御属性修正）
    atk_roll = _roll(1, 20, 0)
    atk_mod = (attacker["attrs"].get(attack_attr, 10) - 10) // 2
    atk_total = atk_roll["total"] + atk_mod

    def_mod = (target["attrs"].get(defense_attr, 10) - 10) // 2
    ac = 10 + def_mod
    hit = atk_total >= ac

    if not hit:
        return success_result("rpg", {
            "action": "resolve_attack",
            "attacker_id": attacker_id,
            "target_id": target_id,
            "hit": False,
            "attack_roll": atk_roll["rolls"][0],
            "attack_total": atk_total,
            "target_ac": ac,
            "message": f"攻击未命中: {atk_roll['rolls'][0]} + {atk_mod} = {atk_total} vs AC{ac}",
        })

    # 2. 伤害掷骰
    from lumen.tools.dice import _DICE_PATTERN
    match = _DICE_PATTERN.match(damage_dice.lower())
    if match:
        count = int(match.group(1)) if match.group(1) else 1
        sides = int(match.group(2))
        mod = int(match.group(3)) if match.group(3) else 0
    else:
        count, sides, mod = 1, 6, 0

    dmg_roll = _roll(count, sides, mod)
    damage = max(1, dmg_roll["total"])  # 最低 1 点伤害

    # 3. HP 更新
    old_hp = target["hp"]
    new_hp = max(0, old_hp - damage)
    ws.update_agent(target_id, hp=new_hp)

    is_dead = new_hp <= 0

    logger.info(f"战斗: {attacker_id} → {target_id}, 伤害 {damage}, HP {old_hp} → {new_hp}")

    return success_result("rpg", {
        "action": "resolve_attack",
        "attacker_id": attacker_id,
        "target_id": target_id,
        "hit": True,
        "attack_roll": atk_roll["rolls"][0],
        "attack_total": atk_total,
        "target_ac": ac,
        "damage_dice": damage_dice,
        "damage_rolls": dmg_roll["rolls"],
        "damage": damage,
        "target_old_hp": old_hp,
        "target_new_hp": new_hp,
        "target_dead": is_dead,
        "message": f"命中! 伤害 {damage}，目标 HP {old_hp} → {new_hp}" + ("，目标已倒下!" if is_dead else ""),
    })


# ── look ──

async def _look(params: dict) -> dict:
    """查看当前房间：描述 + 实体列表"""
    agent_raw = params.get("agent_id") or _get_agent_id()
    if not agent_raw:
        return error_result("rpg", ErrorCode.PARAM_EMPTY, "缺少 agent_id")

    ws = _ensure_world_state()
    agent_id = ws.resolve_agent_id(agent_raw) or agent_raw
    state = ws.get_agent_state(agent_id)

    if not state:
        return error_result("rpg", ErrorCode.PARAM_INVALID, f"Agent {agent_raw} 不在世界中")

    room_id = state.get("room_id", "")
    if not room_id:
        return success_result("rpg", {
            "action": "look",
            "room_id": "",
            "message": "你漂浮在虚空中，不处于任何房间。",
        })

    room = ws.get_room(room_id)
    entities = ws.get_room_entities(room_id)
    room_name = room.get("name", room_id) if room else room_id

    others = [e for e in entities if e["id"] != agent_id]
    entity_lines = []
    for e in others:
        hp_info = f" HP:{e['hp']}/{e['max_hp']}" if e["hp"] < e["max_hp"] else ""
        entity_lines.append(f"  - {e['name']} (id: {e['id']}){hp_info}")

    msg = f"【{room_name}】"
    if entity_lines:
        msg += f"\n这里有:\n" + "\n".join(entity_lines)
    else:
        msg += "\n这里只有你自己。"

    return success_result("rpg", {
        "action": "look",
        "agent_id": agent_id,
        "room_id": room_id,
        "room_name": room_name,
        "entities": others,
        "message": msg,
    })


# ── 路由入口 ──

async def execute(params: dict, command: str = "") -> dict:
    """RPG 工具路由"""
    commands = {
        "move_to": _move_to,
        "roll_check": _roll_check,
        "resolve_attack": _resolve_attack,
        "look": _look,
    }

    if command not in commands:
        return error_result(
            "rpg",
            ErrorCode.PARAM_INVALID,
            f"未知命令: {command}",
            {"available": list(commands.keys())},
        )

    return await commands[command](params)
