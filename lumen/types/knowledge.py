"""
Lumen - 知识库类型定义
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class KnowledgeFileCard(BaseModel):
    """知识库文件完整定义"""
    id: str = Field(..., description="文件ID，格式 kb{timestamp6}{random3}")
    source_path: str = Field(default="", description="源文件相对路径")
    filename: str = Field(..., description="原始文件名")
    file_type: str = Field(default="txt", description="文件类型: txt/md")
    category: str = Field(default="imports", description="分类: imports/notes/rpg/public")
    chunk_count: int = Field(default=0, description="切分后的 chunk 数量")
    char_count: int = Field(default=0, description="原始文件字符数")
    access_list: List[str] = Field(default_factory=lambda: ["public"], description="访问控制列表")
    owner_id: str = Field(default="", description="所属 Agent ID")
    file_id: str = Field(default="", description="源文件追踪 ID")
    # RESERVED: P2 标签系统 — 知识库条目分类标签
    tags: List[str] = Field(default_factory=list)
    created_at: str = Field(default="", description="导入时间 ISO格式")
    updated_at: str = Field(default="", description="最后更新时间")


class KnowledgeCreateRequest(BaseModel):
    """创建知识库条目请求"""
    filename: str = Field(..., description="文件名")
    content: str = Field(..., description="文件正文内容")
    category: str = Field(default="imports", description="分类")
    subdir: str = Field(default="", description="子目录（如 世界观/地理）")


class KnowledgeUpdateRequest(BaseModel):
    """更新知识库条目请求"""
    tags: Optional[List[str]] = None


class KnowledgeListItem(BaseModel):
    """知识库文件列表项（轻量级）"""
    id: str
    source_path: str
    filename: str
    file_type: str
    category: str
    chunk_count: int
    char_count: int
    tags: List[str]
    created_at: str


class KnowledgeSearchRequest(BaseModel):
    """搜索请求"""
    query: str = Field(..., min_length=1, description="搜索文本")
    top_k: int = Field(default=5, ge=1, le=50, description="返回结果数")
    min_score: float = Field(default=0.3, ge=0.0, le=1.0, description="最低相似度")
    category: Optional[str] = Field(default=None, description="按分类过滤")


class KnowledgeSearchResult(BaseModel):
    """单条搜索结果"""
    chunk_id: int = Field(..., description="TriviumDB 节点ID")
    file_id: str = Field(..., description="所属文件ID")
    source_path: str = Field(default="", description="源文件相对路径")
    filename: str = Field(..., description="所属文件名")
    content: str = Field(..., description="chunk 正文")
    score: float = Field(..., description="相似度分数")
    chunk_index: int = Field(..., description="chunk 在原文件中的序号")
