"""
Lumen - Skills 渐进式披露注入

模板/格式化逻辑：从 services/skills 加载数据，格式化为提示词。
CRUD 操作在 services/skills.py。
"""
import os
import logging
from typing import List

from lumen.services.skills import load_skill, _skill_path, SKILLS_DIR
from lumen.services.context.token_estimator import estimate_text_tokens

logger = logging.getLogger(__name__)


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
