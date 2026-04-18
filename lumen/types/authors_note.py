"""
Lumen - Author's Note 类型定义
每会话独立的临时提示词注入
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal


class AuthorsNoteConfig(BaseModel):
    """单个会话的 Author's Note 配置"""
    enabled: bool = False
    content: str = ""
    injection_position: Literal["before_user", "after_user"] = "before_user"
    target: str = "all"  # MVP 固定 "all"，未来群聊支持 agent_id


class AuthorsNoteUpdateRequest(BaseModel):
    """API 更新请求（所有字段可选）"""
    enabled: Optional[bool] = None
    content: Optional[str] = None
    injection_position: Optional[Literal["before_user", "after_user"]] = None
