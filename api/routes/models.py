"""
模型管理 API
从 LiteLLM 代理获取可用模型列表
"""

from fastapi import APIRouter, HTTPException
import logging

router = APIRouter()

from lumen.config import client

logger = logging.getLogger(__name__)


@router.get("/list")
async def list_models():
    """获取 LiteLLM 代理上可用的模型列表

    Returns:
        {"models": [{"id": "model-name", "owned_by": "..."}, ...]}
    """
    try:
        response = await client.models.list()
        models = []
        for model in response.data:
            models.append({
                "id": model.id,
                "owned_by": getattr(model, "owned_by", ""),
            })
        models.sort(key=lambda m: m["id"])
        return {"models": models}
    except Exception as e:
        logger.warning("获取模型列表失败: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"无法从 LiteLLM 代理获取模型列表: {str(e)}"
        )
