"""
Lumen - Skills 类型定义

Skills 定义 AI 的工作方式（提示词模板/工作流）
与角色卡（AI 是谁）、世界书（AI 知道什么）、工具（AI 能做什么）互补
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class SkillCard(BaseModel):
    """Skill 完整定义"""
    name: str = Field(..., description="Skill 显示名")
    description: str = Field(default="", description="一句话说明")
    content: str = Field(default="", description="提示词正文（核心）")
    enabled: bool = Field(default=True, description="是否启用")


class SkillCreateRequest(BaseModel):
    """创建 Skill 请求"""
    id: Optional[str] = None
    name: str
    description: str = ""
    content: str = ""
    enabled: bool = True


class SkillUpdateRequest(BaseModel):
    """更新 Skill 请求（部分更新）"""
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    enabled: Optional[bool] = None


class SkillListItem(BaseModel):
    """Skill 列表项"""
    id: str
    name: str
    description: str
    enabled: bool
