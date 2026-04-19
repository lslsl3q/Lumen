"""
Lumen - Skills 数据管理

Markdown 文件存储（YAML frontmatter + 正文）+ 内存缓存 + CRUD + 注入文本生成

文件格式：
---
name: 写作助手
description: 帮助用户进行创意写作
enabled: true
---

你是一个专业的写作助手...
"""
import os
import re
import logging
from typing import List, Dict, Optional
from lumen.types.skills import SkillCard

logger = logging.getLogger(__name__)

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")

_cached_skills: Optional[List[Dict]] = None


def _validate_id(skill_id: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_\-]+$', skill_id):
        raise ValueError(f"非法的 Skill ID: {skill_id}")
    return skill_id


def _parse_md(filepath: str) -> Dict:
    """解析 YAML frontmatter + Markdown 正文的 .md 文件"""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    meta = {"enabled": True, "description": ""}
    content = text

    # 提取 frontmatter（--- ... ---）
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            fm = parts[1].strip()
            content = parts[2].strip()
            for line in fm.split("\n"):
                line = line.strip()
                if ":" not in line:
                    continue
                key, _, val = line.partition(":")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key == "enabled":
                    meta[key] = val.lower() in ("true", "yes", "1")
                elif key in ("name", "description"):
                    meta[key] = val

    meta["content"] = content
    return meta


def _serialize_md(skill: Dict) -> str:
    """将 skill 数据序列化为 Markdown + YAML frontmatter"""
    lines = [
        "---",
        f"name: {skill.get('name', '')}",
        f"description: {skill.get('description', '')}",
        f"enabled: {'true' if skill.get('enabled', True) else 'false'}",
        "---",
        "",
        skill.get("content", ""),
    ]
    return "\n".join(lines)


def list_skills() -> List[Dict]:
    """列出所有 Skill"""
    global _cached_skills
    if _cached_skills is not None:
        return _cached_skills

    skills = []
    if not os.path.exists(SKILLS_DIR):
        return skills

    for filename in os.listdir(SKILLS_DIR):
        if filename.endswith(".md"):
            try:
                skill_id = filename[:-3]
                raw = _parse_md(os.path.join(SKILLS_DIR, filename))
                skill = SkillCard.model_validate(raw)
                skills.append({**skill.model_dump(), "id": skill_id})
            except Exception as e:
                logger.warning("跳过损坏的 Skill 文件 %s: %s", filename, e)

    _cached_skills = skills
    return skills


def load_skill(skill_id: str) -> Dict:
    """加载单个 Skill"""
    _validate_id(skill_id)
    filepath = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Skill 不存在: {skill_id}")

    raw = _parse_md(filepath)
    skill = SkillCard.model_validate(raw)
    return {**skill.model_dump(), "id": skill_id}


def create_skill(skill_id: str, data: Dict) -> Dict:
    """创建 Skill"""
    _validate_id(skill_id)
    os.makedirs(SKILLS_DIR, exist_ok=True)
    filepath = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if os.path.exists(filepath):
        raise FileExistsError(f"Skill 已存在: {skill_id}")

    skill = SkillCard.model_validate(data)
    raw = skill.model_dump()

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(_serialize_md(raw))

    _clear_cache()
    logger.info("创建 Skill: %s", skill_id)
    return {**raw, "id": skill_id}


def update_skill(skill_id: str, updates: Dict) -> Dict:
    """更新 Skill（部分更新）"""
    _validate_id(skill_id)
    filepath = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Skill 不存在: {skill_id}")

    existing = _parse_md(filepath)
    existing.update(updates)
    skill = SkillCard.model_validate(existing)
    raw = skill.model_dump()

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(_serialize_md(raw))

    _clear_cache()
    logger.info("更新 Skill: %s", skill_id)
    return {**raw, "id": skill_id}


def delete_skill(skill_id: str) -> None:
    """删除 Skill"""
    _validate_id(skill_id)
    filepath = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Skill 不存在: {skill_id}")

    os.remove(filepath)
    _clear_cache()
    logger.info("删除 Skill: %s", skill_id)


def get_skills_content(skill_ids: List[str]) -> str:
    """根据 Skill ID 列表生成注入文本"""
    if not skill_ids:
        return ""

    parts = []
    for sid in skill_ids:
        try:
            data = load_skill(sid)
            if data.get("enabled", True) and data.get("content"):
                parts.append(f'<skill name="{data["name"]}">\n{data["content"]}\n</skill>')
        except FileNotFoundError:
            logger.warning("Skill 不存在，跳过: %s", sid)
        except Exception as e:
            logger.warning("加载 Skill 失败 %s: %s", sid, e)

    if not parts:
        return ""

    return "<skills>\n" + "\n".join(parts) + "\n</skills>"


def _clear_cache():
    global _cached_skills
    _cached_skills = None
