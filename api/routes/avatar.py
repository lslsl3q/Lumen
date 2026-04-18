"""
头像管理 API 接口

提供头像的上传、列表、删除功能
支持为 Character 和 Persona 选择头像
"""

import os
import json
import logging
import time
import random
import string
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File

router = APIRouter()

logger = logging.getLogger(__name__)

# 头像存储目录（与现有系统保持一致）
AVATARS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "lumen", "characters", "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)


def _generate_avatar_id() -> str:
    """生成唯一的头像 ID

    格式：avt{时间戳后6位}{3位随机字符}
    例如：avt234567abc
    """
    timestamp = str(int(time.time()))[-6:]  # 时间戳后6位
    random_chars = ''.join(random.choices(string.ascii_lowercase, k=3))  # 3位小写字母
    return f"avt{timestamp}{random_chars}"


@router.get("/list")
async def list_avatars():
    """获取所有已上传的头像列表"""
    try:
        avatars = []
        if not os.path.exists(AVATARS_DIR):
            return avatars

        for filename in os.listdir(AVATARS_DIR):
            if filename.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
                filepath = os.path.join(AVATARS_DIR, filename)
                # 获取文件大小
                size = os.path.getsize(filepath)
                # 获取修改时间
                mtime = os.path.getmtime(filepath)

                avatars.append({
                    "id": filename.rsplit(".", 1)[0],  # 去掉扩展名
                    "filename": filename,
                    "url": f"/avatars/{filename}",
                    "size": size,
                    "created_at": mtime,
                })

        # 按创建时间倒序排列
        avatars.sort(key=lambda x: x["created_at"], reverse=True)
        return avatars

    except Exception as e:
        logger.error(f"获取头像列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取头像列表失败: {str(e)}")


@router.post("/upload")
async def upload_avatar(file: UploadFile = File(..., description="头像文件")):
    """上传头像文件

    支持的格式：png, jpg, jpeg, gif, webp
    最大文件大小：5MB
    """
    try:
        # 验证文件类型
        allowed_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
        file_ext = os.path.splitext(file.filename or "")[1].lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式：{file_ext}。支持的格式：png, jpg, jpeg, gif, webp"
            )

        # 读取文件内容
        file_content = await file.read()

        # 验证文件大小（5MB）
        max_size = 5 * 1024 * 1024
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"文件过大：{len(file_content) / 1024 / 1024:.2f}MB。最大支持 5MB"
            )

        # 生成唯一 ID
        avatar_id = _generate_avatar_id()

        # 保存文件
        filename = f"{avatar_id}{file_ext}"
        filepath = os.path.join(AVATARS_DIR, filename)

        with open(filepath, "wb") as f:
            f.write(file_content)

        logger.info(f"头像上传成功: {filename}")

        return {
            "id": avatar_id,
            "filename": filename,
            "url": f"/avatars/{filename}",
            "size": len(file_content),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"头像上传失败: {e}")
        raise HTTPException(status_code=500, detail=f"头像上传失败: {str(e)}")


@router.delete("/{avatar_id}")
async def delete_avatar(avatar_id: str):
    """删除头像文件

    avatar_id: 头像 ID（不含扩展名）
    """
    try:
        # 查找对应的文件
        avatar_file = None
        if os.path.exists(AVATARS_DIR):
            for filename in os.listdir(AVATARS_DIR):
                if filename.startswith(avatar_id + "."):
                    avatar_file = filename
                    break

        if not avatar_file:
            raise HTTPException(status_code=404, detail=f"头像不存在: {avatar_id}")

        filepath = os.path.join(AVATARS_DIR, avatar_file)

        # 删除文件
        os.remove(filepath)
        logger.info(f"头像删除成功: {avatar_file}")

        return {"message": f"头像 {avatar_id} 删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"头像删除失败: {e}")
        raise HTTPException(status_code=500, detail=f"头像删除失败: {str(e)}")
