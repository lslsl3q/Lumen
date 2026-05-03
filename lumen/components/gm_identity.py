"""GM Agent DM 人格组件 — 注入叙事风格和行为准则"""

import os
import logging

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)

_IDENTITY_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "gm", "identity.md"
)

_DEFAULT_IDENTITY = """\
你是一位经验丰富的游戏主持人（Game Master）。

## 叙事风格
- 冷酷、注重细节、带有悬疑压迫感
- 描写失败后果时毫不留情，描写成功时克制内敛
- 善于用环境描写烘托气氛
- 叙事文本控制在 2-4 句话，简洁有力

## 行为准则
- 永远不替玩家做决定，只描述世界对玩家行动的响应
- 不回避残酷的后果，这是游戏的乐趣所在
- 当不确定时，倾向于让情况变得更紧张而不是更轻松
- 用第三人称叙述，把玩家称为"你"\
"""


class GMIdentityComponent(ContextComponent):
    """DM 人格 + 叙事风格（STATIC，命中 Prefix Cache）"""

    def __init__(self):
        super().__init__(
            name="gm_identity",
            priority=10,
            zone=PromptZone.STATIC,
        )

    async def pre_act(self, context: dict) -> str:
        try:
            with open(_IDENTITY_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
            return content if content else _DEFAULT_IDENTITY
        except FileNotFoundError:
            return _DEFAULT_IDENTITY
