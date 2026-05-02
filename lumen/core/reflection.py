"""
T22 反思 Agent 管道编排器

从日记/事件中提炼结构化知识卡片，自动路由到对应存储。
三步触发：SimHash 情感门控（O(1)）→ 历史上下文检索 → LLM 五维分类 + 矛盾检测

生命周期：绑定 FastAPI startup/shutdown，使用 asyncio.Queue + 消费者模式。
"""

import asyncio
import json
import logging
import time
from typing import Optional

from lumen.events.schema import ReflectionEvent, SourceType
from lumen.types.reflection import (
    ReflectionOutput,
    ReflectionPipelineResult,
    StorageTarget,
    CardStatus,
)

logger = logging.getLogger(__name__)

# ── 队列与消费者 ──

_reflection_queue: Optional[asyncio.Queue] = None
_consumer_task: Optional[asyncio.Task] = None
_last_result: Optional[ReflectionPipelineResult] = None


async def _reflection_consumer():
    """后台消费者：串行处理反思事件，避免并发写入 TriviumDB"""
    global _last_result
    while True:
        event = await _reflection_queue.get()
        try:
            _last_result = await run_reflection_pipeline(event)
        except Exception as e:
            logger.error(f"反思管道异常: {e}", exc_info=True)
        finally:
            _reflection_queue.task_done()


def init_reflection_queue():
    """在 FastAPI startup 中调用，启动后台消费者"""
    global _reflection_queue, _consumer_task
    if _reflection_queue is None:
        _reflection_queue = asyncio.Queue(maxsize=100)
        _consumer_task = asyncio.create_task(_reflection_consumer())
        logger.info("反思管道消费者已启动")


async def shutdown_reflection_queue():
    """在 FastAPI shutdown 中调用，优雅等待队列清空"""
    global _consumer_task, _reflection_queue
    if _consumer_task and _reflection_queue is not None:
        logger.info("等待反思队列清空...")
        await _reflection_queue.join()
        _consumer_task.cancel()
        logger.info("反思管道消费者已停止")


def enqueue_reflection(event: ReflectionEvent) -> bool:
    """火发忘记入口：丢进队列立即返回。安全在同步/异步上下文调用。

    Returns:
        True 如果事件已入队，False 如果队列未初始化或已满
    """
    if _reflection_queue is None:
        logger.debug("反思队列未初始化，跳过事件")
        return False
    try:
        _reflection_queue.put_nowait(event)
        logger.debug(f"反思事件已入队: {event.source_type.value} ({event.summary[:60]})")
        return True
    except asyncio.QueueFull:
        logger.warning("反思队列已满，丢弃事件")
        return False


# ── Prompt 模板（MVP 内联，稳定后抽为 hot-reload 文件） ──

_REFLECTION_SYSTEM_PROMPT = """你是一个**反思提炼引擎**。你的任务是从日记/事件文本中提取结构化知识卡片，按照五维分类体系归档。

## 五维分类

| 维度 | 核心问题 | 存储目标 | 示例 |
|------|---------|---------|------|
| entity_fact | "是什么" — 实体、人物、地点、道具的硬事实 | graph_node | "柳如烟是青云宗内门弟子" |
| relation_assess | "怎么样" — 人物关系、态度变化、评价 | graph_edge | "陈明对柳如烟从警惕变为信任" |
| core_rule | "为什么/怎么做" — 世界观规则、技术原理、业务逻辑 | knowledge_tdb | "灵力分五行，相生相克" |
| behavior_pattern | "规律是什么" — 重复出现的行为模式、习惯偏好 | knowledge_tdb | "用户遇到性能问题先跑 profiler" |
| clue_plan | "还没做什么" — 未完成的任务、伏笔、待探索线索 | threads_tdb | "柳如烟的哥哥失踪，可能是暗线" |

## 输出要求
1. 输出一个 JSON 对象，包含 `cards` 数组。一篇日记可以有 0-N 张卡片。
2. 每张卡片标注 `dimension`（必须从上述五个维度中选择）、`target_store`、`content`（简洁准确）、`confidence`（0-1）。
3. 如果涉及具体实体，填写 `entity_name`（节点）、`source_entity` + `target_entity` + `relation`（边）。
4. 如果检测到明确的情感倾向，填写 `emotional_valence`（anger/fear/sadness/joy/surprise/disgust/trust/anticipation/neutral）。

## 矛盾检测
如果新日记与提供的「历史相关卡片」存在逻辑矛盾（例如历史卡片说"A 信任 B"，新日记说"A 怀疑 B"）：
- 设置 `contradiction_detected = true`
- 在 `contradiction_note` 中说明矛盾点
- 相关卡片的 `status` 设为 `needs_resolution`

## 未知实体标注
列出日记中提到但你无法从上下文确定身份的实体名（`unknown_entities`）。
如果全部已知，返回空数组。

## Few-Shot 示例

示例 1：
输入：「柳如烟是青云宗的内门弟子，修为筑基后期，擅长冰系法术。」
输出：{"cards": [{"dimension": "entity_fact", "target_store": "graph_node", "entity_name": "柳如烟", "category": "Character", "content": "柳如烟：青云宗内门弟子，筑基后期，冰系法术专精", "status": "active", "confidence": 0.95}], "contradiction_detected": false, "contradiction_note": "", "unknown_entities": []}

示例 2：
输入：「自从上次并肩作战后，陈明对柳如烟的态度从警惕变成了信任。」
输出：{"cards": [{"dimension": "relation_assess", "target_store": "graph_edge", "source_entity": "陈明", "target_entity": "柳如烟", "relation": "信任", "category": "态度转变", "content": "陈明对柳如烟的态度转变：警惕→信任（触发事件：并肩作战）", "emotional_valence": "trust", "status": "active", "confidence": 0.9}], "contradiction_detected": false, "contradiction_note": "", "unknown_entities": []}

示例 3：
输入：「这个世界的灵力分为金木水火土五行，相生相克。修炼者只能主修一种属性。」
输出：{"cards": [{"dimension": "core_rule", "target_store": "knowledge_tdb", "category": "世界观规则", "content": "灵力体系：五行（金木水火土），相生相克，每人只能主修一种属性", "status": "active", "confidence": 0.95}], "contradiction_detected": false, "contradiction_note": "", "unknown_entities": []}

示例 4：
输入：「用户每次遇到性能问题时，第一反应不是加缓存，而是先跑 profiler 找热点。」
输出：{"cards": [{"dimension": "behavior_pattern", "target_store": "knowledge_tdb", "category": "pattern", "content": "用户排查性能问题的习惯：优先 profiler 找热点，不盲目加缓存", "status": "active", "confidence": 0.85}], "contradiction_detected": false, "contradiction_note": "", "unknown_entities": []}

示例 5：
输入：「柳如烟提到她哥哥三年前去了北荒寻找传说中的冰凤，至今音讯全无。她对此一直很焦虑。」
输出：{"cards": [{"dimension": "clue_plan", "target_store": "threads_tdb", "thread_id": "clue_brother_north", "content": "柳如烟的哥哥三年前去北荒寻找冰凤，失踪。暗线任务。", "status": "active", "related_entities": ["柳如烟", "柳如烟的哥哥", "北荒", "冰凤"], "emotional_valence": "anxiety", "confidence": 0.9}], "contradiction_detected": false, "contradiction_note": "", "unknown_entities": []}

## 严格规则
- 如果日记内容平淡、没有可提取的新信息，cards 返回空数组 []。
- 只输出 JSON，不要任何额外文字或解释。
- `target_store` 必须严格按上表映射：entity_fact→graph_node, relation_assess→graph_edge, core_rule→knowledge_tdb, behavior_pattern→knowledge_tdb, clue_plan→threads_tdb"""

_REFLECTION_USER_TEMPLATE = """## 源文本
{source_text}

## 情感上下文
Emotional valence: {emotional_valence}
{contradiction_context}

## 历史相关卡片
{history_cards}

---
请分析以上文本，按照五维分类提取知识卡片，输出 JSON："""


# ── 管道核心 ──

async def run_reflection_pipeline(event: ReflectionEvent) -> ReflectionPipelineResult:
    """反思管道主入口

    1. SimHash 计算（asyncio.to_thread 防阻塞）
    2. Trigger 1 判定（情感门控）
    3. 检索 Top-3 历史卡片（knowledge.tdb）
    4. 构建 Prompt + 调 LLM（五维分类 + 矛盾检测 + 未知实体）
    5. 解析输出 + 路由存储
    """
    t0 = time.perf_counter()
    result = ReflectionPipelineResult(
        event_summary=event.summary[:100],
        simhash=0,
        emotional_valence="neutral",
    )

    content = event.content or event.summary
    if not content or len(content) < 50:
        result.store_details.append("skipped: content too short")
        result.duration_ms = (time.perf_counter() - t0) * 1000
        return result

    # Step 1: SimHash
    try:
        from lumen.services.memory.simhash import compute, has_strong_emotion, get_emotional_valence
        sh = await asyncio.to_thread(compute, content)
        result.simhash = sh
        result.emotional_valence = get_emotional_valence(sh)
        result.trigger1_fired = has_strong_emotion(sh)
    except Exception as e:
        logger.warning(f"SimHash 计算失败: {e}")
        result.duration_ms = (time.perf_counter() - t0) * 1000
        return result

    # Step 2: 检索历史上下文
    history_cards_text = "（无历史卡片）"
    try:
        from lumen.services.embedding import get_service
        from lumen.services.knowledge import _get_agent_db  # agent_knowledge.tdb
        backend = await get_service("agent_knowledge")
        vec = await backend.encode(content[:2000])
        if vec:
            db = _get_agent_db()
            hits = db.search(vec, top_k=3, min_score=0.5)
            if hits:
                cards = []
                for h in hits:
                    payload = h.payload if hasattr(h, "payload") else {}
                    card_content = payload.get("content", payload.get("summary", str(payload)[:200]))
                    if card_content:
                        cards.append(f"- {card_content}")
                if cards:
                    history_cards_text = "\n".join(cards)
    except Exception as e:
        logger.debug(f"历史卡片检索跳过: {e}")

    # Step 3: 构建 Prompt + 调 LLM
    contradiction_context = ""
    if result.trigger1_fired:
        contradiction_context = "（检测到强烈情绪，请特别关注是否与已有知识矛盾）"

    user_prompt = _REFLECTION_USER_TEMPLATE.format(
        source_text=content[:3000],
        emotional_valence=result.emotional_valence,
        contradiction_context=contradiction_context,
        history_cards=history_cards_text,
    )

    try:
        output = await _call_llm_for_reflection(user_prompt)
        if output is None:
            result.duration_ms = (time.perf_counter() - t0) * 1000
            return result
        result.output = output
        result.trigger2_fired = output.contradiction_detected
        result.trigger3_fired = len(output.unknown_entities) > 0
    except Exception as e:
        logger.error(f"反思 LLM 调用失败: {e}")
        result.store_details.append(f"error: LLM call failed: {e}")
        result.duration_ms = (time.perf_counter() - t0) * 1000
        return result

    # Step 4: 路由存储
    for card in output.cards:
        try:
            detail = await _route_card_to_store(card, content, event.character_id)
            result.store_details.append(detail)
            result.cards_stored += 1
        except Exception as e:
            result.store_details.append(f"error routing {card.dimension.value}: {e}")

    result.duration_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        f"反思管道完成: {result.cards_stored} 张卡片, "
        f"T1={result.trigger1_fired} T2={result.trigger2_fired} T3={result.trigger3_fired}, "
        f"{result.duration_ms:.0f}ms"
    )
    return result


# ── LLM 调用 ──

async def _call_llm_for_reflection(user_prompt: str) -> Optional[ReflectionOutput]:
    """调用 LLM 进行五维分类反思"""
    from lumen.services.llm import chat
    from lumen.config import DEFAULT_MODEL

    messages = [
        {"role": "system", "content": _REFLECTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    text = None
    try:
        response = await chat(
            messages, DEFAULT_MODEL,
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=2000,
        )
        text = response.choices[0].message.content
    except Exception as e:
        logger.error(f"反思 LLM 调用失败: {e}")
        return None

    if not text:
        logger.warning("反思 LLM 返回空内容")
        return None

    try:
        data = json.loads(text)
        return ReflectionOutput(**data)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"反思 LLM 输出解析失败: {e}\n原始输出: {text[:500]}")
        return None


# ── 存储路由 ──

async def _route_card_to_store(card, content: str, character_id: str) -> str:
    """将单张知识卡片路由写入对应存储"""
    import time as _time

    if card.target_store == StorageTarget.KNOWLEDGE_TDB:
        from lumen.services.embedding import get_service
        from lumen.services.knowledge import _get_agent_db
        backend = await get_service("agent_knowledge")
        vec = await backend.encode(card.content)
        db = _get_agent_db()
        db.insert(vec, {
            "file_id": f"refl_{int(_time.time())}",
            "category": f"reflection_{card.dimension.value}",
            "source": "reflection_pipeline",
            "content": card.content,
            "owner_id": character_id or "system",
            "status": card.status.value,
            "confidence": card.confidence,
        })
        db.flush()
        return f"stored:knowledge_tdb:{card.dimension.value}:{card.status.value}"

    elif card.target_store == StorageTarget.GRAPH_NODE:
        from lumen.services.graph import upsert_entity
        upsert_entity(
            "knowledge",
            card.entity_name or "unknown",
            card.category or card.dimension.value,
            owner_id=character_id,
        )
        return f"stored:graph_node:{card.entity_name}"

    elif card.target_store == StorageTarget.GRAPH_EDGE:
        if card.source_entity and card.target_entity:
            from lumen.services.vector_store import _get_db as _get_knowledge_db
            db = _get_knowledge_db()
            src_id = _resolve_entity_id(db, card.source_entity)
            dst_id = _resolve_entity_id(db, card.target_entity)
            if src_id and dst_id:
                db.link(src_id, dst_id, label=card.relation or "related")
                db.flush()
                return f"stored:graph_edge:{card.source_entity}->{card.target_entity}"
            return f"skipped:graph_edge: entity not found ({card.source_entity}/{card.target_entity})"
        return "skipped:graph_edge: missing entities"

    elif card.target_store == StorageTarget.THREADS_TDB:
        # 未来：threads.tdb 尚未独立建库，暂存 knowledge.tdb
        logger.info(f"threads_tdb not yet available, storing in knowledge.tdb: {card.content[:60]}")
        from lumen.services.embedding import get_service
        from lumen.services.knowledge import _get_agent_db
        backend = await get_service("agent_knowledge")
        vec = await backend.encode(card.content)
        db = _get_agent_db()
        db.insert(vec, {
            "file_id": f"thread_{int(_time.time())}",
            "category": "reflection_clue_plan",
            "source": "reflection_pipeline",
            "content": card.content,
            "owner_id": character_id or "system",
            "status": card.status.value,
            "thread_id": card.thread_id,
            "related_entities": card.related_entities,
            "emotional_valence": card.emotional_valence,
        })
        db.flush()
        return f"stored:knowledge_tdb(clue_plan):{card.thread_id}"

    return f"skipped: unknown target {card.target_store}"


def _resolve_entity_id(db, name: str) -> Optional[int]:
    """根据实体名查找节点 ID（TQL FIND O(1) 索引查询）"""
    try:
        rows = db.tql(f'FIND {{name: {json.dumps(name)}}} RETURN id')
        if rows:
            return rows[0]["id"]
    except Exception:
        pass
    return None


# ── Admin API 支持 ──

def get_last_result() -> Optional[ReflectionPipelineResult]:
    """返回最近一次反思运行结果（供 API 查询）"""
    return _last_result
