"""
T22 GM 裁决输出模型

Concordia 4 步链式思考浓缩为单次 JSON 输出。
完整版用于跑团 DM 模式，轻量版用于日常聊天。
"""

from typing import Optional
from pydantic import BaseModel, Field


class AgencyCheck(BaseModel):
    """自主性校验结果 — 检查裁决是否替其他角色做了决定"""
    entity_name: str = Field(description="被检查的实体名")
    status: str = Field(
        default="preserved",
        description="preserved=仅描述可观察反应 / compromised=替该实体做了决定"
    )
    note: str = Field(default="", description="简要说明")


class FullResolution(BaseModel):
    """完整版裁决输出 — 跑团 DM 模式使用"""
    success: bool = Field(description="行动是否成功")
    success_reason: str = Field(description="详细解释行动成功或失败的原因，引用具体情境因素")
    causal_statement: str = Field(description="完整的因果链描述")
    most_likely_outcome: str = Field(description="最合理的结果，用叙事化语言描述")
    alternative_outcomes: list[str] = Field(default_factory=list, description="备选结果列表")
    affected_entities: list[str] = Field(default_factory=list, description="受影响的实体名列表")
    agency_check: dict[str, str] = Field(
        default_factory=dict,
        description="{实体名: preserved/compromised - 简要说明}"
    )
    world_state_changes: dict[str, str] = Field(
        default_factory=dict,
        description="本次裁决直接影响的状态变量变更"
    )
    emotional_valence: str = Field(
        default="neutral",
        description="anxiety/anger/fear/sadness/joy/calm/neutral"
    )
    narrative: str = Field(description="最终叙事文本，DM 可以直接朗读或展示给玩家")
    needs_follow_up: bool = Field(default=False, description="是否需要后续处理")
    follow_up_hint: str = Field(default="", description="给 DM 的后续处理提示")


class LightResolution(BaseModel):
    """轻量版裁决输出 — 日常聊天模式使用"""
    success: bool = Field(description="行动/请求是否合理可行")
    outcome: str = Field(description="简洁的结果描述，1-2 句话")
    emotional_shift: Optional[str] = Field(default=None, description="情绪变化描述，如无变化则为 null")
    needs_attention: bool = Field(default=False, description="是否需要用户关注")
