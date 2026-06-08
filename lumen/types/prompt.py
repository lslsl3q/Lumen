"""
Lumen - 提示词模块专用类型
CharacterCard（Pydantic）校验 JSON 文件加载
DynamicContext（TypedDict）内部传递
"""

from pydantic import BaseModel
from typing import Optional
from typing import TypedDict

class ThinkingConfig(BaseModel):
    """思考链配置 — 控制模型的推理深度"""
    enabled: bool = False
    budget_tokens: int = 1024       # 思考 token 预算（256 ~ 32000）

class CharacterCard(BaseModel):
    """角色卡片 — 从 JSON 文件加载时校验"""
    name: str
    system_prompt: str = ""
    description: str | None = None
    greeting: str | None = None
    tools: list[str] = []
    model: str | None = None
    avatar: str | None = None
    tool_tips: dict[str, str] = {}
    # 上下文管理
    context_size: int | None = None       # token 预算（None = 用全局默认）
    auto_compact: bool = False               # 自动 compact 开关
    compact_threshold: float = 0.7           # 触发阈值（0.5~0.95）
    # 跨会话记忆
    memory_enabled: bool = True              # 跨会话记忆开关
    memory_token_budget: int = 300           # 记忆召回 token 上限
    memory_auto_summarize: bool = False      # 超预算时自动总结（否则截断）
    # 知识库检索
    knowledge_enabled: bool = True           # 知识库检索总开关
    knowledge_semantic_routing: bool = True  # 语义路由（自动判断查询涉及哪些分类，与占位符互补）
    knowledge_top_k: int = 3                 # 检索条数
    knowledge_min_score: float = 0.3         # 最低相似度阈值
    knowledge_token_budget: int = 500        # 知识注入 token 上限
    # Skills
    skills: list[str] = []                   # 绑定的 Skill ID 列表
    # 回复风格
    response_style: str | None = "balanced"  # brief / balanced / detailed
    # 知识库访问权限
    accessible_knowledge: list[str] = []  # ["public", "char_alice", "shared"]
    # Agent 写入目标
    write_targets: dict[str, str] = {}  # {"diary": "/日记/{character_id}", ...}
    # 思考链
    thinking: ThinkingConfig | None = None

class DynamicContext(TypedDict):
    """动态上下文注入项"""
    content: str
    injection_point: str  # "system" | "before_user" | "after_user"
