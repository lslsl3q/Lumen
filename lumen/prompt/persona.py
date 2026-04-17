"""
Lumen - Persona 数据管理
加载和管理 personas/ 目录下的用户身份定义文件
完全复用角色系统（prompt/character.py）的模式
"""

import json
import os
import re
import logging

from lumen.types.persona import PersonaCard, ActivePersona

logger = logging.getLogger(__name__)

# Persona 卡片文件夹（lumen/personas/）
PERSONAS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "personas")

# 激活状态文件（lumen/data/active_persona.json）
ACTIVE_PERSONA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "active_persona.json"
)

# 模块级缓存
_cached_active: dict | None = None


def _validate_persona_id(persona_id: str) -> str:
    """校验 Persona ID 合法性，防止路径穿越"""
    if not re.match(r'^[a-zA-Z0-9_\-]+$', persona_id):
        raise ValueError(f"非法的 Persona ID: {persona_id}")
    return persona_id


# ========================================
# Persona CRUD（和角色系统一样）
# ========================================

def list_personas() -> list[dict]:
    """列出所有 Persona，返回 [{"id": ..., "name": ...}, ...]"""
    personas = []
    if not os.path.exists(PERSONAS_DIR):
        return personas

    for filename in os.listdir(PERSONAS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(PERSONAS_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                card = PersonaCard.model_validate(raw)
            except Exception as e:
                logger.warning("跳过损坏的 Persona 文件 %s: %s", filename, e)
                continue
            persona_id = filename[:-5]
            personas.append({"id": persona_id, "name": card.name})
    return personas


def load_persona(persona_id: str) -> dict:
    """加载 Persona，Pydantic 校验后返回 dict"""
    _validate_persona_id(persona_id)
    filepath = os.path.join(PERSONAS_DIR, f"{persona_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Persona 不存在: {persona_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    card = PersonaCard.model_validate(raw)
    return card.model_dump()


def create_persona(persona_id: str, data: dict) -> dict:
    """创建新 Persona"""
    _validate_persona_id(persona_id)
    os.makedirs(PERSONAS_DIR, exist_ok=True)
    filepath = os.path.join(PERSONAS_DIR, f"{persona_id}.json")
    if os.path.exists(filepath):
        raise FileExistsError(f"Persona 已存在: {persona_id}")

    card = PersonaCard.model_validate(data)
    raw = card.model_dump()

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    logger.info("创建 Persona: %s", persona_id)
    return raw


def update_persona(persona_id: str, updates: dict) -> dict:
    """更新已有 Persona（合并字段）"""
    _validate_persona_id(persona_id)
    filepath = os.path.join(PERSONAS_DIR, f"{persona_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Persona 不存在: {persona_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        existing = json.load(f)

    existing.update(updates)

    card = PersonaCard.model_validate(existing)
    raw = card.model_dump()

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    logger.info("更新 Persona: %s", persona_id)
    return raw


def delete_persona(persona_id: str) -> None:
    """删除 Persona（禁止删 default）"""
    if persona_id == "default":
        raise ValueError("不能删除默认 Persona")

    _validate_persona_id(persona_id)
    filepath = os.path.join(PERSONAS_DIR, f"{persona_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Persona 不存在: {persona_id}")

    os.remove(filepath)
    logger.info("删除 Persona: %s", persona_id)


# ========================================
# 激活状态管理
# ========================================

def get_active_persona_id() -> str | None:
    """获取当前激活的 Persona ID（带缓存）"""
    global _cached_active
    if _cached_active is not None:
        return _cached_active.get("persona_id")

    if not os.path.exists(ACTIVE_PERSONA_FILE):
        return None

    try:
        with open(ACTIVE_PERSONA_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        active = ActivePersona.model_validate(raw)
        _cached_active = active.model_dump()
        return active.persona_id
    except Exception:
        return None


def set_active_persona(persona_id: str | None) -> None:
    """设置当前激活的 Persona"""
    global _cached_active

    if persona_id is not None:
        _validate_persona_id(persona_id)
        # 确认 Persona 存在
        filepath = os.path.join(PERSONAS_DIR, f"{persona_id}.json")
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Persona 不存在: {persona_id}")

    os.makedirs(os.path.dirname(ACTIVE_PERSONA_FILE), exist_ok=True)
    active = ActivePersona(persona_id=persona_id)
    with open(ACTIVE_PERSONA_FILE, "w", encoding="utf-8") as f:
        json.dump(active.model_dump(), f, ensure_ascii=False, indent=2)

    _cached_active = active.model_dump()
    logger.info("切换激活 Persona: %s", persona_id or "(无)")


# ========================================
# 注入文本生成
# ========================================

def get_active_persona_text() -> str:
    """获取当前激活 Persona 的格式化文本（供 builder 注入）

    返回空字符串表示不需要注入
    """
    persona_id = get_active_persona_id()
    if not persona_id:
        return ""

    try:
        persona = load_persona(persona_id)
    except Exception:
        return ""

    name = persona.get("name", "")
    description = persona.get("description", "")
    traits = persona.get("traits", [])

    # 所有字段都为空 → 不注入
    if not name and not description and not traits:
        return ""

    parts = ["<user_persona>"]
    parts.append("你正在对话的用户信息如下：")

    if name:
        parts.append(f"用户名称：{name}")
    if description:
        parts.append(f"用户描述：{description}")
    if traits:
        parts.append("用户特征：")
        for trait in traits:
            parts.append(f"  - {trait}")

    parts.append("请在对话中基于这些用户信息来理解和回应。")
    parts.append("</user_persona>")
    return "\n".join(parts)
