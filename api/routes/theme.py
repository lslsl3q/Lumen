"""Design Token 主题系统 — REST API 路由

FastAPI 路由，提供前端调用接口。
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumen.services.storage import theme as theme_storage
from lumen.services import theme as theme_service

router = APIRouter()


# ── Request Models ──

class SwitchThemeRequest(BaseModel):
    theme_id: str


class ApplyTokensRequest(BaseModel):
    tokens: dict[str, str]


class SaveThemeRequest(BaseModel):
    name: str
    description: str = ""


# ── Endpoints ──

@router.get("/list")
async def list_themes():
    """列出所有可用主题"""
    def _sync():
        themes = theme_storage.list_themes()
        current_id = theme_storage.get_current_theme_id()
        for theme in themes:
            theme["is_current"] = theme["id"] == current_id
        return themes

    themes = await asyncio.to_thread(_sync)
    return {"themes": themes}


@router.get("/current")
async def get_current_theme():
    """获取当前主题的完整 token 值"""
    def _sync():
        theme_id = theme_storage.get_current_theme_id()
        return theme_id, theme_service.get_full_theme(theme_id)

    theme_id, tokens = await asyncio.to_thread(_sync)
    return {"theme_id": theme_id, "tokens": tokens}


@router.get("/{theme_id}")
async def get_theme(theme_id: str):
    """获取指定主题的完整 token 值"""
    def _sync():
        return theme_service.get_full_theme(theme_id)

    tokens = await asyncio.to_thread(_sync)
    if not tokens:
        raise HTTPException(status_code=404, detail=f"主题不存在: {theme_id}")
    return {"theme_id": theme_id, "tokens": tokens}


@router.post("/switch")
async def switch_theme(req: SwitchThemeRequest):
    """切换到指定主题"""
    try:
        def _sync():
            return theme_service.apply_theme_switch(req.theme_id)

        tokens = await asyncio.to_thread(_sync)
        return {"theme_id": req.theme_id, "tokens": tokens}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/override")
async def apply_token_overrides(req: ApplyTokensRequest):
    """应用 token 微调到当前主题"""
    def _sync():
        return theme_service.apply_token_overrides(req.tokens)

    result = await asyncio.to_thread(_sync)
    return result


@router.delete("/override")
async def clear_overrides():
    """清空当前主题的所有覆盖值"""
    def _sync():
        theme_id = theme_storage.get_current_theme_id()
        theme_storage.clear_overrides(theme_id)
        return theme_service.get_full_theme(theme_id)

    tokens = await asyncio.to_thread(_sync)
    return {"message": "已清空覆盖值", "tokens": tokens}


@router.post("/save")
async def save_theme(req: SaveThemeRequest):
    """保存当前主题为新主题"""
    try:
        def _sync():
            return theme_service.save_as_new_theme(req.name, req.description)

        new_theme = await asyncio.to_thread(_sync)
        return new_theme
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{theme_id}")
async def delete_theme(theme_id: str):
    """删除指定主题（仅非内置主题）"""
    def _sync():
        return theme_storage.delete_theme(theme_id)

    success = await asyncio.to_thread(_sync)
    if not success:
        raise HTTPException(status_code=400, detail=f"删除失败：主题不存在或为内置主题")
    return {"message": f"已删除主题: {theme_id}"}
