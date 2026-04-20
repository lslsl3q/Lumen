"""
Lumen - Skills 数据管理

Markdown 文件存储（YAML frontmatter + 正文）+ 内存缓存 + CRUD + 渐进式披露注入

文件格式（目录结构）：
  lumen/skills/skill-name/SKILL.md

也兼容旧的单文件格式：
  lumen/skills/skill-name.md

两种状态：
  enabled=True  → 预注入（清单 + 完整内容，受 token 预算控制）
  enabled=False → 不注入，但可通过 /skill-name 手动调用
"""
import os
import re
import logging
from typing import List, Dict, Optional
from lumen.types.skills import SkillCard
from lumen.services.context.token_estimator import estimate_text_tokens

logger = logging.getLogger(__name__)

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")

_cached_skills: Optional[List[Dict]] = None


def _validate_id(skill_id: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_\-]+$', skill_id):
        raise ValueError(f"非法的 Skill ID: {skill_id}")
    return skill_id


def _skill_path(skill_id: str) -> Optional[str]:
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


def list_skills() -> List[Dict]:
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


def get_skill_content_for_invoke(skill_id: str) -> str:
    """获取 skill 完整内容（用于懒加载/命令调用）

    返回格式化的 skill 内容，可直接注入到对话中。
    """
    data = load_skill(skill_id)
    if not data.get("content"):
        return ""

    header = f"# Skill: {data['name']}"
    if data.get("description"):
        header += f"\n> {data['description']}"

    return f"{header}\n\n{data['content']}"


def get_skills_content(skill_ids: List[str], token_budget: int = 800) -> str:
    """渐进式披露注入（参考 Claude Code 设计）

    1. 始终注入清单（名称 + 描述 + when_to_use）
    2. 在 token 预算内注入完整内容（按 priority 排序）
    3. 超预算的 skill 只保留清单行

    Args:
        skill_ids: 角色 equip 的 skill ID 列表
        token_budget: 完整内容的 token 预算
    """
    if not skill_ids:
        return ""

    # 加载所有 skill（只取 enabled 的）
    skills = []
    for sid in skill_ids:
        try:
            data = load_skill(sid)
            if data.get("enabled", True):
                skills.append(data)
        except FileNotFoundError:
            logger.warning("Skill 不存在，跳过: %s", sid)
        except Exception as e:
            logger.warning("加载 Skill 失败 %s: %s", sid, e)

    if not skills:
        return ""

    # 按 priority 降序排列（高优先级先注入）
    skills.sort(key=lambda s: s.get("priority", 0), reverse=True)

    # 第一层：清单（始终注入）
    listing_lines = []
    for s in skills:
        line = f"- {s['name']}: {s.get('description', '')}"
        if s.get("when_to_use"):
            line += f"\n  使用时机: {s['when_to_use']}"
        listing_lines.append(line)

    listing = "<skills_listing>\n已装备的 Skill:\n" + "\n".join(listing_lines) + "\n</skills_listing>"

    # 第二层：完整内容（token 预算内）
    content_parts = []
    used_tokens = 0
    for s in skills:
        if not s.get("content"):
            continue
        skill_text = f'<skill name="{s["name"]}">\n{s["content"]}\n</skill>'
        skill_tokens = estimate_text_tokens(skill_text)
        if used_tokens + skill_tokens > token_budget:
            continue
        content_parts.append(skill_text)
        used_tokens += skill_tokens

    if content_parts:
        return listing + "\n<skills>\n" + "\n".join(content_parts) + "\n</skills>"
    return listing


def _clear_cache():
    global _cached_skills
    _cached_skills = None


async def invoke_skill(skill_id: str, args: str = "") -> str:
    """完整 skill 调用（懒加载 + 脚本执行）

    用于斜杠命令触发：
    1. 加载 SKILL.md 内容
    2. 有脚本 → 安全执行，注入输出
    3. 返回完整提示词文本
    """
    data = load_skill(skill_id)
    prompt = get_skill_content_for_invoke(skill_id)

    # 脚本执行
    if data.get("script"):
        from lumen.tools.skill_script import validate_script_path, run_skill_script

        filepath = _skill_path(skill_id)
        if os.path.isdir(filepath):
            skill_dir = filepath
        else:
            skill_dir = SKILLS_DIR
        script_path = validate_script_path(skill_dir, data["script"])
        output = await run_skill_script(script_path, args, skill_dir=skill_dir)
        if output:
            prompt += f"\n\n## 脚本输出\n{output}"

    return prompt
