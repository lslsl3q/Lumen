"""
技能加载器 — 从 skills/ 目录加载技能模板

技能是可复用的指令模板，注入到子代理的 system prompt 中。
格式：Markdown + YAML frontmatter（与 agent 定义相同）。
"""

import logging
import os
from typing import Any
from dataclasses import dataclass

import yaml

logger = logging.getLogger(__name__)

# 技能搜索路径（按优先级）
_SKILL_DIRS = [
    os.path.join(os.path.dirname(__file__), "skills"),  # 内置
    os.path.expanduser("~/.lumen/skills"),               # 用户自定义
]


@dataclass
class SkillConfig:
    name: str
    description: str = ""
    content: str = ""


def _parse_skill(filepath: str) -> SkillConfig | None:
    """解析技能 markdown 文件"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()
    except IOError:
        return None

    if not text.startswith("---"):
        return SkillConfig(name=os.path.basename(filepath).replace(".md", ""), content=text)

    # 解析 YAML frontmatter
    parts = text.split("---", 2)
    if len(parts) < 3:
        return None

    try:
        metadata = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        metadata = {}

    body = parts[2].strip()

    return SkillConfig(
        name=metadata.get("name", ""),
        description=metadata.get("description", ""),
        content=body,
    )


def discover_skills() -> dict[str, SkillConfig]:
    """发现所有可用技能"""
    skills: dict[str, SkillConfig] = {}

    for skill_dir in _SKILL_DIRS:
        if not os.path.isdir(skill_dir):
            continue
        for filename in os.listdir(skill_dir):
            if not filename.endswith(".md"):
                continue
            filepath = os.path.join(skill_dir, filename)
            skill = _parse_skill(filepath)
            if skill and skill.name:
                skills[skill.name] = skill

    return skills


def get_skill(name: str) -> SkillConfig | None:
    """获取单个技能"""
    for skill_dir in _SKILL_DIRS:
        filepath = os.path.join(skill_dir, f"{name}.md")
        if os.path.exists(filepath):
            return _parse_skill(filepath)
    return None


def load_skills(skill_names: list[str]) -> str:
    """加载多个技能，拼接为注入文本

    Returns:
        拼接后的技能文本（可直接注入 system prompt）
    """
    if not skill_names:
        return ""

    parts = []
    for name in skill_names:
        skill = get_skill(name)
        if skill:
            parts.append(f"## Skill: {skill.name}\n\n{skill.content}")
        else:
            logger.warning(f"Skill '{name}' not found, skipping")

    return "\n\n---\n\n".join(parts)


def list_skills() -> list[dict[str, str]]:
    """列出所有可用技能"""
    skills = discover_skills()
    return [
        {"name": s.name, "description": s.description}
        for s in skills.values()
    ]
