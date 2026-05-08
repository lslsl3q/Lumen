"""
头像管理 API 接口
"""

from fastapi import APIRouter, HTTPException, UploadFile, File

from lumen.services import avatar as avatar_service

router = APIRouter()


@router.get("/list")
async def list_avatars():
    return avatar_service.list_avatars()


@router.post("/upload")
async def upload_avatar(file: UploadFile = File(..., description="头像文件")):
    try:
        file_content = await file.read()
        return avatar_service.upload_avatar(file.filename or "", file_content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"头像上传失败: {str(e)}")


@router.delete("/{avatar_id}")
async def delete_avatar(avatar_id: str):
    try:
        avatar_service.delete_avatar(avatar_id)
        return {"message": f"头像 {avatar_id} 删除成功"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"头像不存在: {avatar_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"头像删除失败: {str(e)}")
