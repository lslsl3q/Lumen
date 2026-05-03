"""GM Agent 裁决规则组件 — 4 步裁决法 + JSON 输出格式"""

import logging

from lumen.components.base import ContextComponent, PromptZone
from lumen.prompt.gm_resolution import get_full_prompts

logger = logging.getLogger(__name__)


class GMResolutionComponent(ContextComponent):
    """裁决规则 + JSON schema（STATIC，命中 Prefix Cache）"""

    def __init__(self):
        super().__init__(
            name="gm_resolution",
            priority=50,
            zone=PromptZone.STATIC,
        )

    async def pre_act(self, context: dict) -> str:
        system_prompt, _ = get_full_prompts()

        # 追加 JSON 输出格式强调
        json_instruction = """

## 输出格式（严格遵守）
你必须输出合法的 JSON 对象，不要用 markdown 代码块包裹。
不要在 JSON 字符串值中使用未转义的换行符（\\n）或引号（\"）。
```json
{"success": true, "causal_statement": "...", "most_likely_outcome": "...", "narrative": "给玩家看的叙事文本（2-4句话）", "emotional_valence": "calm", "affected_entities": [], "world_state_changes": {}, "needs_follow_up": false}
```
`narrative` 字段是你对玩家的直接回复，用第二人称（"你"）描述。"""

        return system_prompt + json_instruction
