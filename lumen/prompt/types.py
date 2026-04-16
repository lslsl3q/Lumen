"""
Lumen - 提示词模块专用类型
CharacterCard（Pydantic）校验 JSON 文件加载
DynamicContext（TypedDict）内部传递
"""

from pydantic import BaseModel
from typing import Optional, List, Dict
from typing import TypedDict


class CharacterCard(BaseModel):
    """角色卡片 — 从 JSON 文件加载时校验"""
    name: str
    system_prompt: str = ""
    description: Optional[str] = None
    greeting: Optional[str] = None
    tools: List[str] = []
    model: Optional[str] = None
    avatar: Optional[str] = None           # 头像文件名（如 "default.png"）
    tool_tips: Dict[str, str] = {}         # 用户自定义的工具提示（fallback 到 registry 的 usage_guide）


class DynamicContext(TypedDict):
    """动态上下文注入项"""
    content: str
    injection_point: str  # "system" | "before_user" | "after_user"
