"""
T22 反思输出类型定义

五维分类 + 存储路由 + 卡片状态（含矛盾隔离）
LLM 输出的 ReflectionOutput 经 Pydantic 验证后路由到不同存储。
"""

from enum import Enum
from pydantic import BaseModel, Field


class ReflectionDimension(str, Enum):
    """五维反思分类 — 对齐 project_reflection_system.md 第三章"""
    ENTITY_FACT = "entity_fact"           # ① 实体与硬事实 → 图谱节点
    RELATION_ASSESS = "relation_assess"   # ② 关系动态与评价 → 图谱边 + SimHash 情感位元
    CORE_RULE = "core_rule"              # ③ 核心规则与知识 → knowledge.tdb
    BEHAVIOR_PATTERN = "behavior_pattern" # ④ 行为模式与习惯 → knowledge.tdb (type="pattern")
    CLUE_PLAN = "clue_plan"              # ⑤ 状态线索与计划 → threads.tdb


class StorageTarget(str, Enum):
    """知识卡片存储目标"""
    GRAPH_NODE = "graph_node"         # 图谱节点（entity）
    GRAPH_EDGE = "graph_edge"         # 图谱边（relationship）
    KNOWLEDGE_TDB = "knowledge_tdb"   # 知识库向量存储
    THREADS_TDB = "threads_tdb"       # 线索/计划存储


class CardStatus(str, Enum):
    """知识卡片的审批/矛盾状态"""
    ACTIVE = "active"                      # 正常可用，参与 RAG 检索
    NEEDS_RESOLUTION = "needs_resolution"  # 检测到矛盾，隔离等待人工裁决
    DRAFT = "draft"                        # 低置信度，待确认后激活


class ReflectionCard(BaseModel):
    """LLM 输出的单张知识卡片

    一篇日记可产出多张卡片（不同维度），强制数组输出。
    """
    dimension: ReflectionDimension
    category: str = Field(default="", description="维度内子分类")
    content: str = Field(description="合成的知识卡片文本")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    target_store: StorageTarget
    status: CardStatus = CardStatus.ACTIVE

    # 图谱路由
    entity_name: str = ""
    source_entity: str = ""
    target_entity: str = ""
    relation: str = ""

    # 线索/计划路由
    thread_id: str = ""
    priority: int = 0
    related_entities: list[str] = Field(default_factory=list)

    # 情感
    emotional_valence: str = "neutral"


class ReflectionOutput(BaseModel):
    """LLM 反思输出的顶层结构 — 必须是数组，不是单对象"""
    cards: list[ReflectionCard] = Field(description="产出的知识卡片列表")
    contradiction_detected: bool = False
    contradiction_note: str = ""
    unknown_entities: list[str] = Field(default_factory=list)


class ReflectionPipelineResult(BaseModel):
    """反思管道一次运行的聚合结果"""
    event_summary: str = ""
    simhash: int = 0
    emotional_valence: str = "neutral"
    trigger1_fired: bool = False
    trigger2_fired: bool = False
    trigger3_fired: bool = False
    output: ReflectionOutput | None = None
    cards_stored: int = 0
    store_details: list[str] = Field(default_factory=list)
    duration_ms: float = 0.0
