"""
Lumen - Skills 数据管理（CRUD）

Markdown 文件存储（YAML frontmatter + 正文）+ 内存缓存

文件格式（目录结构）：
  lumen/skills/skill-name/SKILL.md

也兼容旧的单文件格式：
  lumen/skills/skill-name.md
"""
import os
import re
import logging
from typing import Optional
from lumen.types.skills import SkillCard
from lumen.config import SKILLS_DIR

logger = logging.getLogger(__name__)

_cached_skills: list[dict] | None = None

def _validate_id(skill_id: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_\-]+$', skill_id):
        raise ValueError(f"非法的 Skill ID: {skill_id}")
    return skill_id

def _skill_path(skill_id: str) -> str | None:
    """找到 skill 文件路径（优先目录格式，兼容单文件）"""
    dir_path = os.path.join(SKILLS_DIR, skill_id, "SKILL.md")
    if os.path.exists(dir_path):
        return dir_path
    file_path = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if os.path.exists(file_path):
        return file_path
    return None

def _parse_md(filepath: str) -> Dict:
    """解析 YAML frontmatter + Markdown 正文的 .md 文件"""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    meta: Dict = {
        "enabled": True,
        "description": "",
        "when_to_use": "",
        "allowed_tools": [],
        "argument_hint": "",
        "priority": 0,
        "script": "",
    }
    content = text

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
                elif key == "priority":
                    try:
                        meta[key] = int(val)
                    except ValueError:
                        pass
                elif key == "allowed_tools":
                    if val.startswith("["):
                        meta[key] = [t.strip().strip('"').strip("'") for t in val.strip("[]").split(",") if t.strip()]
                    else:
                        meta[key] = [t.strip() for t in val.split(",") if t.strip()]
                elif key in ("name", "description", "when_to_use", "argument_hint", "script"):
                    meta[key] = val

    meta["content"] = content
    return meta

def _serialize_md(skill: Dict) -> str:
    """将 skill 数据序列化为 Markdown + YAML frontmatter"""
    tools = skill.get("allowed_tools", [])
    tools_str = "[" + ", ".join(tools) + "]" if tools else "[]"

    lines = [
        "---",
        f"name: {skill.get('name', '')}",
        f"description: {skill.get('description', '')}",
        f"enabled: {'true' if skill.get('enabled', True) else 'false'}",
        f"when_to_use: {skill.get('when_to_use', '')}",
        f"allowed_tools: {tools_str}",
        f"argument_hint: {skill.get('argument_hint', '')}",
        f"script: {skill.get('script', '')}",
        f"priority: {skill.get('priority', 0)}",
        "---",
        "",
        skill.get("content", ""),
    ]
    return "\n".join(lines)

def list_skills() -> list[dict]:
    """列出所有 Skill（目录格式 + 单文件格式）"""
    global _cached_skills
    if _cached_skills is not None:
        return _cached_skills

    skills = []
    if not os.path.exists(SKILLS_DIR):
        return skills

    seen_ids = set()

    # 1. 扫描目录格式（skill-name/SKILL.md）
    for entry in os.listdir(SKILLS_DIR):
        dir_path = os.path.join(SKILLS_DIR, entry)
        if os.path.isdir(dir_path):
            skill_md = os.path.join(dir_path, "SKILL.md")
            if os.path.exists(skill_md):
                try:
                    skill_id = entry
                    raw = _parse_md(skill_md)
                    skill = SkillCard.model_validate(raw)
                    skills.append({**skill.model_dump(), "id": skill_id})
                    seen_ids.add(skill_id)
                except Exception as e:
                    logger.warning("跳过损坏的 Skill 目录 %s: %s", entry, e)

    # 2. 扫描单文件格式（skill-name.md，向后兼容）
    for filename in os.listdir(SKILLS_DIR):
        if filename.endswith(".md"):
            skill_id = filename[:-3]
            if skill_id in seen_ids:
                continue
            try:
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
    filepath = _skill_path(skill_id)
    if not filepath:
        raise FileNotFoundError(f"Skill 不存在: {skill_id}")

    raw = _parse_md(filepath)
    skill = SkillCard.model_validate(raw)
    return {**skill.model_dump(), "id": skill_id}

def create_skill(skill_id: str, data: Dict) -> Dict:
    """创建 Skill（用目录格式）"""
    _validate_id(skill_id)
    skill_dir = os.path.join(SKILLS_DIR, skill_id)
    skill_md = os.path.join(skill_dir, "SKILL.md")

    # 检查旧格式是否已存在
    legacy_path = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if os.path.exists(skill_md) or os.path.exists(legacy_path):
        raise FileExistsError(f"Skill 已存在: {skill_id}")

    skill = SkillCard.model_validate(data)
    raw = skill.model_dump()

    os.makedirs(skill_dir, exist_ok=True)
    with open(skill_md, "w", encoding="utf-8") as f:
        f.write(_serialize_md(raw))

    _clear_cache()
    logger.info("创建 Skill: %s", skill_id)
    return {**raw, "id": skill_id}

def update_skill(skill_id: str, updates: Dict) -> Dict:
    """更新 Skill（部分更新，自动迁移到目录格式）"""
    _validate_id(skill_id)
    filepath = _skill_path(skill_id)

    if not filepath:
        raise FileNotFoundError(f"Skill 不存在: {skill_id}")

    existing = _parse_md(filepath)
    existing.update(updates)
    skill = SkillCard.model_validate(existing)
    raw = skill.model_dump()

    # 如果是旧格式（单文件），迁移到目录格式
    if filepath.endswith(f"{skill_id}.md") and not filepath.endswith("SKILL.md"):
        skill_dir = os.path.join(SKILLS_DIR, skill_id)
        new_path = os.path.join(skill_dir, "SKILL.md")
        os.makedirs(skill_dir, exist_ok=True)
        with open(new_path, "w", encoding="utf-8") as f:
            f.write(_serialize_md(raw))
        os.remove(filepath)
        logger.info("迁移 Skill 到目录格式: %s", skill_id)
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(_serialize_md(raw))

    _clear_cache()
    logger.info("更新 Skill: %s", skill_id)
    return {**raw, "id": skill_id}

def delete_skill(skill_id: str) -> None:
    """删除 Skill（目录或单文件）"""
    _validate_id(skill_id)

    # 目录格式
    skill_dir = os.path.join(SKILLS_DIR, skill_id)
    if os.path.isdir(skill_dir):
        import shutil
        shutil.rmtree(skill_dir)
        _clear_cache()
        logger.info("删除 Skill 目录: %s", skill_id)
        return

    # 单文件格式
    filepath = os.path.join(SKILLS_DIR, f"{skill_id}.md")
    if os.path.exists(filepath):
        os.remove(filepath)
        _clear_cache()
        logger.info("删除 Skill 文件: %s", skill_id)
        return

    raise FileNotFoundError(f"Skill 不存在: {skill_id}")

def _clear_cache():
    global _cached_skills
    _cached_skills = None
