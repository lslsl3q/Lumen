"""
Lumen - 世界书类型定义

参考：SillyTavern World Info + VCP VCPTavern
核心功能：关键词触发 → 自动注入相关设定
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Literal


class WorldBookEntry(BaseModel):
    """世界书条目定义

    当聊天内容包含关键词时，自动将 content 注入到提示词中
    """
    # === 基础字段 ===
    id: str = Field(..., description="条目ID，用于文件名（字母数字下划线连字符）")
    name: str = Field(..., description="条目名称")
    enabled: bool = Field(default=True, description="是否启用")

    # === 触发条件 ===
    keywords: List[str] = Field(..., description="触发关键词列表")
    secondary_keywords: List[str] = Field(default_factory=list, description="次关键词列表（配合 selective 使用）")
    selective: bool = Field(default=False, description="是否启用次关键词条件")
    selective_logic: Literal["and", "not"] = Field(default="and", description="and=次关键词也必须命中 / not=次关键词不能命中")
    case_sensitive: bool = Field(default=False, description="是否区分大小写")
    whole_word: bool = Field(default=True, description="是否全词匹配")

    # === 注入控制 ===
    content: str = Field(..., description="注入内容")
    position: Literal["before_sys", "after_sys", "before_user", "after_user"] = Field(
        default="before_user",
        description="注入位置：before_sys(系统提示词前)/after_sys(系统提示词后)/before_user(用户消息前)/after_user(用户消息后)"
    )
    depth: int = Field(default=4, ge=1, le=10, description="注入深度（1-10），控制注入顺序")
    order: int = Field(default=0, description="优先级（数字越小越优先）")

    # === 扫描控制 ===
    scan_depth: int = Field(default=10, ge=1, description="扫描最近N条消息")

    # === 角色关联 ===
    character_ids: List[str] = Field(default_factory=list, description="生效的角色ID列表（空=全局生效）")

    # === 元数据 ===
    comment: str = Field(default="", description="备注说明")


class WorldBookCreateRequest(BaseModel):
    """创建世界书条目请求"""
    id: Optional[str] = None  # ID 可选，未提供时自动生成
    name: str
    keywords: List[str]
    content: str
    enabled: bool = True
    secondary_keywords: List[str] = []
    selective: bool = False
    selective_logic: Literal["and", "not"] = "and"
    case_sensitive: bool = False
    whole_word: bool = True
    position: Literal["before_sys", "after_sys", "before_user", "after_user"] = "before_user"
    depth: int = 4
    order: int = 0
    scan_depth: int = 10
    character_ids: List[str] = []
    comment: str = ""


class WorldBookUpdateRequest(BaseModel):
    """更新世界书条目请求（所有字段可选，支持部分更新）"""
    name: Optional[str] = None
    enabled: Optional[bool] = None
    keywords: Optional[List[str]] = None
    content: Optional[str] = None
    secondary_keywords: Optional[List[str]] = None
    selective: Optional[bool] = None
    selective_logic: Optional[Literal["and", "not"]] = None
    case_sensitive: Optional[bool] = None
    whole_word: Optional[bool] = None
    position: Optional[Literal["before_sys", "after_sys", "before_user", "after_user"]] = None
    depth: Optional[int] = None
    order: Optional[int] = None
    scan_depth: Optional[int] = None
    character_ids: Optional[List[str]] = None
    comment: Optional[str] = None


class WorldBookListItem(BaseModel):
    """世界书列表项（轻量级，用于列表展示）"""
    id: str
    name: str
    enabled: bool
    keywords: List[str]
    comment: str
