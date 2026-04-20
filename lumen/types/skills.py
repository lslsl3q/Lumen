"""
Lumen - Skills 类型定义

Skills 定义 AI 的工作方式（提示词模板/工作流）
与角色卡（AI 是谁）、世界书（AI 知道什么）、工具（AI 能做什么）互补

两种状态：
- enabled=True  → 预注入到 system prompt（清单 + 完整内容）
- enabled=False → 不注入，但用户可通过 /skill-name 手动调用
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class SkillCard(BaseModel):
    """Skill 完整定义"""
    name: str = Field(..., description="Skill 显示名")
    description: str = Field(default="", description="一句话说明")
    content: str = Field(default="", description="提示词正文（核心）")
    enabled: bool = Field(default=True, description="是否预注入到提示词")
    # --- 参考 Claude Code 设计 ---
    when_to_use: str = Field(default="", description="什么时候用这个 skill（帮助 AI 判断）")
    allowed_tools: List[str] = Field(default_factory=list, description="这个 skill 需要哪些工具")
    argument_hint: str = Field(default="", description="参数提示（未来斜杠命令用）")
    priority: int = Field(default=0, description="注入优先级（高先注入）")
    script: str = Field(default="", description="可执行脚本路径（相对于 skill 目录）")


class SkillCreateRequest(BaseModel):
    """创建 Skill 请求"""
    id: Optional[str] = None
    name: str
    description: str = ""
    content: str = ""
    enabled: bool = True
    when_to_use: str = ""
    allowed_tools: List[str] = Field(default_factory=list)
    argument_hint: str = ""
    priority: int = 0
    script: str = ""


class SkillUpdateRequest(BaseModel):
    """更新 Skill 请求（部分更新）"""
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    enabled: Optional[bool] = None
    when_to_use: Optional[str] = None
    allowed_tools: Optional[List[str]] = None
    argument_hint: Optional[str] = None
    priority: Optional[int] = None
    script: Optional[str] = None


class SkillListItem(BaseModel):
    """Skill 列表项"""
    id: str
    name: str
    description: str
    enabled: bool
    when_to_use: str = ""
    priority: int = 0
    script: str = ""
