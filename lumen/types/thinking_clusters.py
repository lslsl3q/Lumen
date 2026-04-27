"""
Lumen - 思维簇类型定义
Pydantic 用于外部配置验证（从 JSON 加载），TypedDict 用于内部传递（零开销）
"""

from typing import TypedDict, Optional

from pydantic import BaseModel


# ── Pydantic：外部配置验证 ──

class ChainStep(BaseModel):
    """链中的一步：搜索哪个簇、取多少结果"""
    cluster: str           # 簇目录名（thinking_clusters/ 下的子目录）
    top_k: int = 3         # 该簇检索多少个模块
    min_score: float = 0.3 # 最低相似度阈值


class ChainConfig(BaseModel):
    """完整链定义：一个命名的、有序的簇搜索步骤列表"""
    name: str = "default"
    steps: list[ChainStep] = []
    token_budget: int = 600           # 所有检索模块的总 token 预算
    fusion_weight_query: float = 0.8  # 向量融合时查询的权重
    fusion_weight_results: float = 0.2 # 向量融合时结果的权重


# ── TypedDict：内部传递 ──

class RetrievedModule(TypedDict):
    """从向量检索中取回的一个思维模块"""
    cluster: str       # 所属簇
    filename: str      # .txt 文件名
    content: str       # 模块全文
    score: float       # 相似度分数
    tokens: int        # 估算 token 数


class PipelineResult(TypedDict):
    """思维簇管道的完整输出"""
    modules: list[RetrievedModule]     # 检索到的模块列表
    injection_text: str                # 格式化后的注入文本
    total_tokens: int                  # 实际使用的 token 总数
    degraded_clusters: list[str]       # 检索为空的簇（降级模式）
