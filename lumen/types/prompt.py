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
    avatar: Optional[str] = None
    tool_tips: Dict[str, str] = {}
    # 上下文管理
    context_size: Optional[int] = None       # token 预算（None = 用全局默认）
    auto_compact: bool = False               # 自动 compact 开关
    compact_threshold: float = 0.7           # 触发阈值（0.5~0.95）
    # 跨会话记忆
    memory_enabled: bool = True              # 跨会话记忆开关
    memory_token_budget: int = 300           # 记忆召回 token 上限
    memory_auto_summarize: bool = False      # 超预算时自动总结（否则截断）
    # 知识库检索
    knowledge_enabled: bool = True           # 知识库检索开关
    knowledge_top_k: int = 3                 # 检索条数
    knowledge_min_score: float = 0.3         # 最低相似度阈值
    knowledge_token_budget: int = 500        # 知识注入 token 上限
    # Skills
    skills: List[str] = []                   # 绑定的 Skill ID 列表


class DynamicContext(TypedDict):
    """动态上下文注入项"""
    content: str
    injection_point: str  # "system" | "before_user" | "after_user"
