"""
Author's Note 管理 API
每会话独立的临时提示词注入
"""

from fastapi import APIRouter, HTTPException

from lumen.types.authors_note import AuthorsNoteConfig, AuthorsNoteUpdateRequest
from lumen.prompt.authors_note import (
    get_authors_note_config,
    save_authors_note_config,
    delete_authors_note_config,
    clear_cache,
)

router = APIRouter()


@router.get("/{session_id}")
async def api_get_authors_note(session_id: str):
    """获取会话的 Author's Note（无则返回 null）"""
    config = get_authors_note_config(session_id)
    if config:
        return config.model_dump()
    return None


@router.put("/{session_id}")
async def api_save_authors_note(session_id: str, req: AuthorsNoteUpdateRequest):
    """创建或更新会话的 Author's Note（部分更新）"""
    existing = get_authors_note_config(session_id)

    if existing:
        # 部分更新：只覆盖传入的字段
        updates = {k: v for k, v in req.model_dump().items() if v is not None}
        for k, v in updates.items():
            setattr(existing, k, v)
        save_authors_note_config(session_id, existing)
        return existing.model_dump()
    else:
        # 新建：用请求字段 + 默认值
        config = AuthorsNoteConfig(**req.model_dump(exclude_none=True))
        save_authors_note_config(session_id, config)
        return config.model_dump()


@router.delete("/{session_id}")
async def api_delete_authors_note(session_id: str):
    """删除会话的 Author's Note"""
    delete_authors_note_config(session_id)
    return {"message": f"已删除会话 {session_id} 的 Author's Note"}
