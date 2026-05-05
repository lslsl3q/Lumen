"""T26 时间上下文组件 — 注入系统当前时间到 Agent 提示词（DYNAMIC, priority=25）"""

import datetime
import logging

from lumen.components.base import ContextComponent, PromptZone

logger = logging.getLogger(__name__)


class TimeContextComponent(ContextComponent):
    """时间上下文注入 — 系统当前时间 + 会话持续时长"""

    def __init__(self):
        super().__init__(
            name="time_context",
            priority=25,
            zone=PromptZone.DYNAMIC,
        )

    async def pre_act(self, context: dict) -> str:
        now = datetime.datetime.now()
        weeks = ['一', '二', '三', '四', '五', '六', '日']

        duration = ""
        session_id = context.get("session_id", "")
        if session_id:
            try:
                from lumen.core.session import get_session_manager
                sm = get_session_manager()
                session = sm.get(session_id)
                if session and session.created_at:
                    created = datetime.datetime.fromisoformat(session.created_at)
                    elapsed = now - created
                    total_secs = int(elapsed.total_seconds())
                    if total_secs < 60:
                        duration = f"\n- 会话已持续：{total_secs} 秒"
                    elif total_secs < 3600:
                        duration = f"\n- 会话已持续：{total_secs // 60} 分钟"
                    else:
                        hours = total_secs // 3600
                        mins = (total_secs % 3600) // 60
                        duration = f"\n- 会话已持续：{hours} 小时 {mins} 分钟"
            except Exception:
                pass

        return f"""## 当前时间
- 系统时间：{now.strftime('%Y年%m月%d日 %H:%M:%S')}
- 星期：{weeks[now.weekday()]}{duration}
"""
