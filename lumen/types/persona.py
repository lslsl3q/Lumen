"""
Lumen - Persona 类型定义
PersonaCard（Pydantic）校验 JSON 文件加载
ActivePersona（Pydantic）管理当前激活状态
"""

from pydantic import BaseModel
from typing import Optional

class PersonaCard(BaseModel):
    """单个 Persona 身份卡片"""
    name: str
    description: str = ""
    traits: list[str] = []
    avatar: str | None = None  # 头像 URL

class ActivePersona(BaseModel):
    """当前激活的 Persona"""
    persona_id: str | None = None  # None = 不注入任何 Persona

class PersonaCreateRequest(BaseModel):
    """API 创建请求"""
    id: str | None = None             # Persona ID（可选，未提供时自动生成）
    name: str
    description: str = ""
    traits: list[str] = []
    avatar: str | None = None        # 头像 URL

class PersonaUpdateRequest(BaseModel):
    """API 更新请求（所有字段可选）"""
    name: str | None = None
    description: str | None = None
    traits: list[str] | None = None
    avatar: str | None = None        # 头像 URL

class SwitchPersonaRequest(BaseModel):
    """API 切换激活 Persona 请求"""
    persona_id: str | None = None
