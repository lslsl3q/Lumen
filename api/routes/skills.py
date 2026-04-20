"""
Skills 管理 API 接口

CRUD + 上传导入 + 懒加载调用 + 脚本执行
"""
import os
import time
import random
import string
import zipfile
import shutil
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File

from lumen.types.skills import SkillCreateRequest, SkillUpdateRequest
from lumen.prompt.skill_store import (
    list_skills,
    load_skill,
    create_skill,
    update_skill,
    delete_skill,
    invoke_skill,
    SKILLS_DIR,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# 上传限制
ALLOWED_EXTENSIONS = {".md", ".zip", ".markdown"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB


def _generate_skill_id() -> str:
    """生成唯一的 Skill ID

    格式：skill{时间戳后6位}{3位随机字符}
    """
    timestamp = str(int(time.time()))[-6:]
    random_chars = ''.join(random.choices(string.ascii_lowercase, k=3))
    return f"skill{timestamp}{random_chars}"


@router.get("/list")
async def api_list_skills():
    """获取 Skill 列表"""
    return list_skills()


@router.post("/create")
async def api_create_skill(req: SkillCreateRequest):
    """创建 Skill"""
    skill_id = req.id or _generate_skill_id()

    try:
        data = req.model_dump()
        data.pop("id", None)
        return create_skill(skill_id, data)
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"Skill 已存在: {skill_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{skill_id}")
async def api_get_skill(skill_id: str):
    """获取单个 Skill 详情"""
    try:
        return load_skill(skill_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")


@router.put("/{skill_id}")
async def api_update_skill(skill_id: str, req: SkillUpdateRequest):
    """更新 Skill（部分更新）"""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    try:
        return update_skill(skill_id, updates)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{skill_id}")
async def api_delete_skill(skill_id: str):
    """删除 Skill"""
    try:
        delete_skill(skill_id)
        return {"message": f"已删除 Skill: {skill_id}"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")


@router.get("/invoke/{skill_id}")
async def api_invoke_skill(skill_id: str, args: str = ""):
    """懒加载调用 skill（含脚本执行）"""
    try:
        content = await invoke_skill(skill_id, args)
        if not content:
            raise HTTPException(status_code=400, detail="Skill 内容为空")
        return {"skill_id": skill_id, "content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Skill 不存在: {skill_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload")
async def upload_skill(file: UploadFile = File(..., description="Skill 文件（.md 或 .zip）")):
    """上传导入 Skill

    支持：
    - 单个 .md 文件 → 从文件名推导 ID，创建 skill 目录
    - .zip 压缩包 → 解压到临时目录，扫描 SKILL.md，逐个导入
    """
    filename = file.filename or "unknown.md"
    file_ext = os.path.splitext(filename)[1].lower()

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的格式: {file_ext}。支持 .md 和 .zip")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail=f"文件过大（最大 10MB）")

    if file_ext == ".zip":
        return await _handle_zip_upload(content, filename)
    else:
        return await _handle_md_upload(content, filename)


async def _handle_md_upload(content: bytes, filename: str) -> dict:
    """处理单个 .md 文件上传"""
    skill_id = os.path.splitext(filename)[0].lower().replace(" ", "-")
    # 只保留安全字符
    skill_id = "".join(c for c in skill_id if c.isalnum() or c in "-_")
    if not skill_id:
        skill_id = _generate_skill_id()

    skill_dir = os.path.join(SKILLS_DIR, skill_id)
    skill_md = os.path.join(skill_dir, "SKILL.md")

    if os.path.exists(skill_md):
        raise HTTPException(status_code=409, detail=f"Skill 已存在: {skill_id}")

    os.makedirs(skill_dir, exist_ok=True)
    with open(skill_md, "wb") as f:
        f.write(content)

    # 验证能解析
    try:
        data = load_skill(skill_id)
        logger.info(f"上传导入 Skill: {skill_id} ({data.get('name', '?')})")
        return {"imported": [data]}
    except Exception as e:
        # 解析失败，清理
        shutil.rmtree(skill_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"解析失败: {e}")


async def _handle_zip_upload(content: bytes, filename: str) -> dict:
    """处理 .zip 压缩包上传"""
    import tempfile

    # 解压到临时目录
    tmp_dir = tempfile.mkdtemp(prefix="lumen_skill_")
    zip_path = os.path.join(tmp_dir, filename)

    try:
        with open(zip_path, "wb") as f:
            f.write(content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            # 安全检查：防止路径穿越
            for member in zf.namelist():
                if member.startswith("/") or ".." in member:
                    raise HTTPException(status_code=400, detail=f"压缩包包含不安全路径: {member}")
            zf.extractall(tmp_dir)

        # 扫描 SKILL.md 文件
        imported = []
        for root, _dirs, files in os.walk(tmp_dir):
            for fname in files:
                if fname == "SKILL.md":
                    rel = os.path.relpath(root, tmp_dir)
                    # 用目录名作为 skill_id
                    if rel == ".":
                        # zip 根目录有 SKILL.md → 用 zip 文件名
                        skill_id = os.path.splitext(filename)[0].lower().replace(" ", "-")
                    else:
                        # 取最顶层目录名
                        skill_id = rel.split(os.sep)[0].lower().replace(" ", "-")

                    skill_id = "".join(c for c in skill_id if c.isalnum() or c in "-_")
                    if not skill_id:
                        skill_id = _generate_skill_id()

                    dest_dir = os.path.join(SKILLS_DIR, skill_id)
                    if os.path.exists(dest_dir):
                        logger.warning(f"跳过已存在的 Skill: {skill_id}")
                        continue

                    # 整个目录复制过来
                    if rel == ".":
                        # 单文件在根目录
                        os.makedirs(dest_dir, exist_ok=True)
                        shutil.copy2(os.path.join(root, fname), os.path.join(dest_dir, "SKILL.md"))
                    else:
                        src_dir = os.path.join(tmp_dir, rel.split(os.sep)[0])
                        shutil.copytree(src_dir, dest_dir)

                    try:
                        data = load_skill(skill_id)
                        imported.append(data)
                        logger.info(f"导入 Skill: {skill_id}")
                    except Exception as e:
                        logger.warning(f"导入失败 {skill_id}: {e}")
                        shutil.rmtree(dest_dir, ignore_errors=True)

                elif fname.endswith(".md") and fname != "SKILL.md":
                    # 单个 .md 文件（非 SKILL.md）→ 当作独立 skill
                    skill_id = os.path.splitext(fname)[0].lower().replace(" ", "-")
                    skill_id = "".join(c for c in skill_id if c.isalnum() or c in "-_")
                    if not skill_id:
                        continue

                    dest_dir = os.path.join(SKILLS_DIR, skill_id)
                    if os.path.exists(dest_dir):
                        continue

                    os.makedirs(dest_dir, exist_ok=True)
                    shutil.copy2(os.path.join(root, fname), os.path.join(dest_dir, "SKILL.md"))

                    try:
                        data = load_skill(skill_id)
                        imported.append(data)
                    except Exception:
                        shutil.rmtree(dest_dir, ignore_errors=True)

        if not imported:
            raise HTTPException(status_code=400, detail="压缩包中未找到有效的 Skill 文件")

        return {"imported": imported}

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
