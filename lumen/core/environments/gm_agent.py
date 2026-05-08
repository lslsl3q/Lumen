"""T25 GM Agent 构建器 — 无状态临时 Agent，每次请求创建并销毁"""

import asyncio
import json
import logging
from types import SimpleNamespace
from typing import AsyncGenerator

from lumen.agent import Agent
from lumen.components.gm_identity import GMIdentityComponent
from lumen.components.time_context import TimeContextComponent
from lumen.components.gm_world_context import GMWorldContextComponent
from lumen.components.cognitive_state import CognitiveStateComponent
from lumen.components.gm_resolution import GMResolutionComponent
from lumen.components.tool import ToolComponent
from lumen.components.react_acting import ReActActingComponent
from lumen.services.storage import world_state as ws

logger = logging.getLogger(__name__)


def _build_resolution_summary(result: dict | None) -> str:
    """从裁决 JSON 生成简短摘要，用于系统通知"""
    if not result:
        return ""
    parts = []

    checks = result.get("checks") or result.get("skill_checks") or []
    for chk in checks:
        if isinstance(chk, dict):
            name = chk.get("skill", chk.get("name", ""))
            roll = chk.get("roll", chk.get("result", ""))
            success = chk.get("success")
            if name and roll:
                status = "成功" if success else "失败" if success is False else ""
                parts.append(f"{name}检定{status} ({roll})")

    outcome = result.get("most_likely_outcome", result.get("outcome", ""))
    if outcome and isinstance(outcome, str) and len(outcome) < 50:
        parts.append(outcome)

    return " | ".join(parts) if parts else ""


def _build_gm_agent(
    source_id: str,
    action_content: str,
    session_id: str = "",
) -> Agent:
    """构建临时 GM Agent（用完即弃，不持久化）

    Args:
        source_id: 玩家角色 ID（用于查询 WorldState）
        action_content: 玩家的自然语言行动
        session_id: 原始会话 ID（用于取消信号映射，格式: f"gm_{session_id}"）

    Returns:
        配置好的 GM Agent
    """
    agent = Agent("gm")

    # ContextComponents — 按 priority 排序拼 system prompt
    agent.add_component(GMIdentityComponent())        # priority=10, STATIC
    agent.add_component(TimeContextComponent())        # priority=25, DYNAMIC
    agent.add_component(GMWorldContextComponent())     # priority=30, DYNAMIC
    agent.add_component(CognitiveStateComponent())     # priority=35, DYNAMIC
    agent.add_component(GMResolutionComponent())       # priority=50, STATIC
    agent.add_component(ToolComponent())               # priority=90, STATIC

    # 临时 session（SimpleNamespace 跳过 ChatSession 的 DB 操作）
    gm_session_id = f"gm_{session_id}" if session_id else "gm_temp"
    temp_session = SimpleNamespace(
        session_id=gm_session_id,
        character_id="gm",
        messages=[
            {"role": "system", "content": ""},  # 占位，被 Agent.act() 的 static_prompt 替换
            {"role": "user", "content": action_content},
        ],
    )

    # ActingComponent — ReAct 循环
    agent.act_component = ReActActingComponent(
        session=temp_session,
        character_config={"name": "GM", "response_style": "balanced"},
        user_input=action_content,
        memory_debug=False,
    )

    return agent


async def _update_gm_cognitive_state(
    source_id: str,
    action_content: str,
    resolution_text: str,
) -> None:
    """用 LLM 根据本次裁决更新 GM 的认知状态（异步，不阻塞当前流）"""
    from lumen.services.llm import chat
    from lumen.config import DEFAULT_MODEL

    current = ws.get_cognitive_state(source_id) or {}

    prompt = f"""根据以下 DM 裁决，更新 DM 认知状态。

玩家行动：{action_content[:200]}
DM 裁决：{resolution_text[:300]}
当前状态：{json.dumps(current, ensure_ascii=False) if current else '无（首次）'}

分析 DM 当前心理状态，输出纯 JSON（不要 markdown 代码块）：
{{"goals": [], "attention": "", "emotions": {{}}, "context_summary": ""}}

规则：
- goals: 1-3 个短期叙事目标，按优先级排
- attention: 一句话描述注意力所在
- emotions: {{"情绪名": 0.0-1.0}}，只保留 ≥0.2 的
- context_summary: 一句话概括最近发生的事"""

    try:
        response = await chat(
            messages=[{"role": "user", "content": prompt}],
            model=DEFAULT_MODEL,
            temperature=0.3,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.get("content", "").strip()
        # 剥离可能的 markdown 代码块
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
            if content.endswith("```"):
                content = content[:-3]
        new_state = json.loads(content)

        # 验证必要字段
        if isinstance(new_state, dict) and "attention" in new_state:
            ws.update_cognitive_state(source_id, new_state)
            logger.debug("GM 认知状态已更新: %s", new_state.get("attention", ""))
        else:
            logger.warning("认知状态 LLM 返回格式无效, content=%s", content[:100])

    except Exception as e:
        logger.warning("认知状态更新失败: %s", e)


async def _detect_emotion_and_merge(source_id: str, text: str) -> None:
    """T26: 计算情绪分数并 merge 到认知状态（后台异步，不阻塞主流程）"""
    try:
        from lumen.services.search.embedding import get_service
        from lumen.services.semantic_group import compute_scores

        backend = await get_service("knowledge")
        vec = await backend.encode(text)
        if not vec:
            return

        scores = await compute_scores(vec, "emotion")
        if scores:
            ws.update_cognitive_state(source_id, {"emotion_scores": scores}, merge=True)
            logger.debug("情绪分数已更新: %s → %s", source_id, scores)
    except Exception as e:
        logger.debug("情绪检测跳过: %s", e)


async def gm_chat_stream(
    source_id: str,
    action_content: str,
    session_id: str = "",
) -> AsyncGenerator[dict, None]:
    """GM Agent 流式裁决 — 核心入口

    创建临时 GM Agent → ReAct 循环 → yield SSE 事件 → 销毁

    Args:
        source_id: 玩家角色 ID
        action_content: 玩家的自然语言行动
        session_id: 原始会话 ID（用于取消信号映射）

    Yields:
        SSEEvent dict（text/tool_start/tool_result/rpg_state/done）
    """
    # 记录玩家行动事件
    state = ws.get_agent_state(source_id)
    room_id = state.get("room_id", "") if state else ""
    if room_id:
        ws.record_event(room_id, source_id, "action", action_content[:100])

    # T26: 语义组情绪检测 — 对用户行动计算 emotion_scores 并 merge 到认知状态
    asyncio.create_task(_detect_emotion_and_merge(source_id, action_content))

    # 构建上下文
    context = {
        "source_id": source_id,
        "action_content": action_content,
        "world_state": ws,
    }

    # 创建临时 GM Agent（传入 session_id 让取消信号能到达）
    gm_agent = _build_gm_agent(source_id, action_content, session_id=session_id)

    # ReAct 循环 → SSE 事件流
    async for event in gm_agent.act(context, short_term_history=[]):
        yield event

        # 检测完成：提取叙事并记录事件
        if event.get("type") == "done":
            from lumen.core.environments.narrative_parser import parse_narrative
            messages = gm_agent.act_component.session.messages
            assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
            if assistant_msgs:
                raw = assistant_msgs[-1].get("content", "")
                parsed = parse_narrative(raw)
                if room_id and parsed["narrative"]:
                    ws.record_event(room_id, "gm", "narrative", parsed["narrative"][:100])

                # 叙事提取成功 → 替换前端已流式的原始 JSON
                if parsed["success"]:
                    yield {"type": "text_set", "content": parsed["narrative"]}
                    # 生成检定摘要作为系统通知
                    summary = _build_resolution_summary(parsed.get("full_result"))
                    if summary:
                        yield {"type": "status", "status": "rpg_resolution", "message": summary}
                    # 更新 session 中的最终消息为干净叙事
                    if assistant_msgs:
                        assistant_msgs[-1]["content"] = parsed["narrative"]

                    # 后台异步更新 GM 认知状态（不阻塞当前响应）
                    if parsed["narrative"] and source_id:
                        asyncio.create_task(
                            _update_gm_cognitive_state(
                                source_id, action_content,
                                parsed["narrative"][:300],
                            )
                        )
