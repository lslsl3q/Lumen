"""
Lumen - 通用头像池存储服务

独立于角色的头像管理：上传、列表、删除。
角色绑定的头像保存在 services/character.py::save_avatar。
"""

import os
import logging
import time
import random
import string

from lumen.config import AVATARS_DIR

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


def _generate_avatar_id() -> str:
    """生成唯一的头像 ID（avt + 时间戳后6位 + 3位随机字符）"""
    timestamp = str(int(time.time()))[-6:]
    random_chars = ''.join(random.choices(string.ascii_lowercase, k=3))
    return f"avt{timestamp}{random_chars}"


def ensure_dir():
    os.makedirs(AVATARS_DIR, exist_ok=True)


def list_avatars() -> list[dict]:
    """列出所有头像，按创建时间倒序"""
    ensure_dir()
    avatars = []
    for filename in os.listdir(AVATARS_DIR):
        if filename.endswith(tuple(ALLOWED_EXTENSIONS)):
            filepath = os.path.join(AVATARS_DIR, filename)
            avatars.append({
                "id": filename.rsplit(".", 1)[0],
                "filename": filename,
                "url": f"/avatars/{filename}",
                "size": os.path.getsize(filepath),
                "created_at": os.path.getmtime(filepath),
            })
    avatars.sort(key=lambda x: x["created_at"], reverse=True)
    return avatars


def upload_avatar(filename: str, file_content: bytes) -> dict:
    """上传头像，返回头像信息 dict。校验格式和大小。"""
    file_ext = os.path.splitext(filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件格式：{file_ext}")

    if len(file_content) > MAX_SIZE:
        raise ValueError(f"文件过大：{len(file_content) / 1024 / 1024:.2f}MB，最大支持 5MB")

    ensure_dir()
    avatar_id = _generate_avatar_id()
    save_name = f"{avatar_id}{file_ext}"
    filepath = os.path.join(AVATARS_DIR, save_name)

    with open(filepath, "wb") as f:
        f.write(file_content)

    logger.info(f"头像上传成功: {save_name}")
    return {
        "id": avatar_id,
        "filename": save_name,
        "url": f"/avatars/{save_name}",
        "size": len(file_content),
    }


def delete_avatar(avatar_id: str) -> str:
    """删除头像，返回被删除的文件名。找不到抛 FileNotFoundError。"""
    ensure_dir()
    for filename in os.listdir(AVATARS_DIR):
        if filename.startswith(avatar_id + "."):
            os.remove(os.path.join(AVATARS_DIR, filename))
            logger.info(f"头像删除成功: {filename}")
            return filename
    raise FileNotFoundError(f"头像不存在: {avatar_id}")
