"""
T22 Step 4 深梦境系统

右脑感性层：涟漪召回 → 梦境叙事生成 → 投入热反思管道（左脑）。
MVP 边界：不改 Step 3 任何代码，只新增调度层和感性 Prompt。

架构兼容性（T24 准备）：
- DreamScheduler 独立类 → 未来可转 TickedEnvironment
- ripple_recall / generate_dream_narrative 独立 async 函数 → 未来可转 Component 方法
- run_deep_dream 独立 async 函数 → 未来可转 Agent.act() 编排

生命周期：绑定 FastAPI startup/shutdown，asyncio.Task 后台运行。
"""

import asyncio
import json
import logging
import os
import random
import time
import uuid
from typing import Optional

from lumen.types.dream import DreamState, DreamResult

logger = logging.getLogger(__name__)

# ── 调度参数（env 可覆盖）──

_CHECK_INTERVAL = int(os.getenv("DREAM_CHECK_INTERVAL", "300"))       # 检查间隔（秒）
_MIN_INTERVAL_HOURS = float(os.getenv("DREAM_MIN_INTERVAL_HOURS", "24"))
_NIGHT_START = int(os.getenv("DREAM_NIGHT_START", "22"))
_NIGHT_END = int(os.getenv("DREAM_NIGHT_END", "6"))
_BASE_PROBABILITY = float(os.getenv("DREAM_BASE_PROBABILITY", "0.2"))
_DIARY_BONUS = float(os.getenv("DREAM_DIARY_BONUS", "0.05"))
_MAX_PROBABILITY = float(os.getenv("DREAM_MAX_PROBABILITY", "0.8"))
_STATE_FILE = os.getenv(
    "DREAM_STATE_FILE",
    os.path.join(os.path.dirname(__file__), "..", "data", "dream_state.json"),
)

# ── 梦境 Prompt（Call 1：高温度感性叙事）──

_DREAM_SYSTEM_PROMPT = """\
你是一个**梦境编织者**。你的任务是从记忆碎片中编织一段意识流梦境叙事。

## 你的本质
你不是分析师，你是诗人。你用隐喻、象征和联想来重组记忆。
你不做总结，你做梦。你不说"用户喜欢X"，你描绘"一片由X构成的花田"。

## 输入
你会收到最多 5 段记忆碎片，来自不同的时间深度（近期/中期/深远）。它们是涟漪召回的痕迹。

## 输出要求
1. 写一段 **200-400 字** 的梦境叙事
2. 用**第一人称**或**意识流**视角
3. 允许**时空跳跃**——不按时间线叙事
4. 把记忆碎片中的关键元素**转化为意象**：
   - 人物 → 剪影、声音、触感
   - 地点 → 色调、氛围、气味
   - 情感 → 天气、光线、温度
   - 冲突 → 裂缝、风暴、潮汐
5. 如果检测到**矛盾或张力**（相同事物在不同时间有不同态度），用**超现实意象**表现它
6. 结尾不需要总结或结论——梦境是开放的

## 风格参考
- 像村上春树的梦境描写
- 像大卫·林奇的蒙太奇
- 不像 AI 的分析报告

## 严格规则
- 只输出梦境叙事文本，不要任何分析、注释或 JSON
- 不要写"这段记忆表示…"之类的解读
- 保持中文输出"""

_DREAM_USER_TEMPLATE = """\
## 涟漪记忆碎片

{memory_fragments}

## 当前情感底色
{emotional_tone}

---

请编织梦境叙事："""


# ════════════════════════════════════════════════
# DreamScheduler — 定时调度器
# ════════════════════════════════════════════════

class DreamScheduler:
    """深梦境定时调度器

    周期检查触发条件（时间窗口 + 概率掷骰 + 间隔保护），
    满足时执行 run_deep_dream()。
    """

    def __init__(self):
        self._state = DreamState()
        self._task: Optional[asyncio.Task] = None
        self._last_result: Optional[DreamResult] = None

    # ── 生命周期 ──

    def load_state(self):
        if os.path.exists(_STATE_FILE):
            try:
                with open(_STATE_FILE, "r", encoding="utf-8") as f:
                    self._state = DreamState(**json.load(f))
            except Exception as e:
                logger.warning(f"梦境状态加载失败: {e}")

    def save_state(self):
        try:
            os.makedirs(os.path.dirname(_STATE_FILE), exist_ok=True)
            with open(_STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(self._state.model_dump(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"梦境状态保存失败: {e}")

    async def start(self):
        self.load_state()
        self._task = asyncio.create_task(self._tick_loop())
        logger.info("深梦境调度器已启动")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.save_state()
        logger.info("深梦境调度器已停止")

    # ── 调度逻辑 ──

    async def _tick_loop(self):
        while True:
            await asyncio.sleep(_CHECK_INTERVAL)
            try:
                await self._check_and_trigger()
            except Exception as e:
                logger.error(f"梦境调度检查异常: {e}", exc_info=True)

    async def _check_and_trigger(self):
        if not self._should_trigger():
            return

        characters = _get_characters_with_diaries()
        if not characters:
            return

        char_id = characters[0]
        try:
            result = await run_deep_dream(char_id)
            if result:
                self._last_result = result
                self._state.last_trigger_time = time.time()
                self._state.last_trigger_id = result.dream_id
                self._state.diary_count_since_last = 0
                self._state.total_dreams += 1
                self.save_state()
                logger.info(
                    f"深梦境完成: {result.dream_id}, "
                    f"召回 {result.recalled_count} 篇, "
                    f"{result.duration_ms:.0f}ms"
                )
        except Exception as e:
            logger.error(f"深梦境运行失败: {e}", exc_info=True)

    def _should_trigger(self) -> bool:
        now = time.time()

        # 间隔保护
        if self._state.last_trigger_time > 0:
            elapsed_h = (now - self._state.last_trigger_time) / 3600
            if elapsed_h < _MIN_INTERVAL_HOURS:
                return False

        # 时间窗口（深夜优先）
        hour = time.localtime(now).tm_hour
        in_window = hour >= _NIGHT_START or hour < _NIGHT_END
        if not in_window:
            return False

        # 概率掷骰
        prob = _BASE_PROBABILITY + self._state.diary_count_since_last * _DIARY_BONUS
        prob = min(prob, _MAX_PROBABILITY)
        return random.random() < prob

    # ── 外部接口 ──

    def notify_diary_saved(self):
        self._state.diary_count_since_last += 1

    def get_status(self) -> dict:
        return {
            "last_trigger_time": self._state.last_trigger_time,
            "last_trigger_id": self._state.last_trigger_id,
            "diary_count_since_last": self._state.diary_count_since_last,
            "total_dreams": self._state.total_dreams,
            "last_result": self._last_result.model_dump() if self._last_result else None,
        }


# ════════════════════════════════════════════════
# 全局单例
# ════════════════════════════════════════════════

_scheduler: Optional[DreamScheduler] = None


def init_dream_scheduler():
    """在 FastAPI startup 中调用"""
    global _scheduler
    _scheduler = DreamScheduler()
    asyncio.create_task(_scheduler.start())


async def shutdown_dream_scheduler():
    """在 FastAPI shutdown 中调用"""
    global _scheduler
    if _scheduler:
        await _scheduler.stop()
        _scheduler = None


def get_dream_scheduler() -> Optional[DreamScheduler]:
    return _scheduler


# ════════════════════════════════════════════════
# 涟漪召回（三段时间窗口）
# ════════════════════════════════════════════════

async def ripple_recall(character_id: str) -> list[dict]:
    """近期 0-7d Top-2 + 中期 7-90d Top-2 + 深远 90d+ Top-1 = 5 篇"""
    now = time.time()
    DAY = 86400

    ranges = [
        ("recent", now - 7 * DAY, now, 2),
        ("mid", now - 90 * DAY, now - 7 * DAY, 2),
        ("deep", 0, now - 90 * DAY, 1),
    ]

    results: list[dict] = []
    for label, t_start, t_end, top_k in ranges:
        hits = _scan_time_range(character_id, t_start, t_end, top_k)
        for h in hits:
            h["time_range"] = label
        results.extend(hits)

    return results[:5]


def _scan_time_range(
    character_id: str, t_start: float, t_end: float, top_k: int,
) -> list[dict]:
    """遍历 agent_knowledge.tdb，按时间窗口过滤日记条目"""
    from lumen.services.knowledge import _get_agent_db
    from datetime import datetime

    db = _get_agent_db()
    candidates: list[dict] = []

    # TQL FIND 过滤：只拉 daily_note + 指定角色的节点，不再全表扫描
    if character_id:
        rows = db.tql(f'FIND {{source: "daily_note", owner_id: {json.dumps(character_id)}}} RETURN *')
    else:
        rows = db.tql('FIND {source: "daily_note"} RETURN *')

    for row in rows:
        payload = row.get("payload", {})
        created_at = payload.get("created_at", "")
        if not created_at:
            continue
        try:
            entry_ts = datetime.fromisoformat(created_at).timestamp()
        except Exception:
            continue

        if not (t_start <= entry_ts <= t_end):
            continue

        content = payload.get("content", "")
        if not content or len(content) < 20:
            continue

        candidates.append({
            "node_id": row.get("id"),
            "content": content,
            "created_at": created_at,
            "importance": payload.get("importance", 3),
        })

    candidates.sort(key=lambda x: x["importance"], reverse=True)
    return candidates[:top_k]


def _get_characters_with_diaries() -> list[str]:
    """获取有日记记录的角色列表"""
    from lumen.services.knowledge import _get_agent_db

    try:
        db = _get_agent_db()
        rows = db.tql('FIND {source: "daily_note"} RETURN payload')
        owners: set[str] = set()
        for row in rows:
            owner = row.get("payload", {}).get("owner_id", "")
            if owner:
                owners.add(owner)
        return list(owners)
    except Exception:
        return []


# ════════════════════════════════════════════════
# Call 1：梦境叙事生成（高温度感性）
# ════════════════════════════════════════════════

async def generate_dream_narrative(
    memory_fragments: list[dict],
    emotional_tone: str = "neutral",
) -> Optional[str]:
    """调用 LLM 生成感性梦境叙事。返回叙事文本或 None。"""
    from lumen.config import DEFAULT_MODEL

    fragments_text = ""
    for i, frag in enumerate(memory_fragments, 1):
        label = frag.get("time_range", "unknown")
        content = frag.get("content", "")
        fragments_text += f"\n### 碎片 {i}（{label}）\n{content}\n"

    user_prompt = _DREAM_USER_TEMPLATE.format(
        memory_fragments=fragments_text or "（无记忆碎片）",
        emotional_tone=emotional_tone,
    )

    try:
        from lumen.services.llm import chat
        messages = [
            {"role": "system", "content": _DREAM_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
        response = await chat(
            messages, DEFAULT_MODEL,
            temperature=0.9,
            max_tokens=1500,
        )
        narrative = response.choices[0].message.content
        if narrative:
            logger.info(f"梦境叙事生成: {len(narrative)} 字")
        return narrative
    except Exception as e:
        logger.error(f"梦境叙事生成失败: {e}")
        return None


# ════════════════════════════════════════════════
# 深梦境主流程
# ════════════════════════════════════════════════

async def run_deep_dream(character_id: str) -> Optional[DreamResult]:
    """涟漪召回 → Call 1（梦境叙事）→ 投入 Step 3 热反思管道（Call 2 自动）

    不修改任何 Step 3 代码。
    """
    t0 = time.perf_counter()
    dream_id = f"dream_{int(time.time())}_{uuid.uuid4().hex[:6]}"

    logger.info(f"深梦境启动: {dream_id}, 角色: {character_id}")

    # Step 1: 涟漪召回
    fragments = await ripple_recall(character_id)
    if not fragments:
        logger.info("涟漪召回为空，跳过深梦境")
        return None

    emotional_tone = _infer_emotional_tone(fragments)

    # Step 2: Call 1 — 梦境叙事
    narrative = await generate_dream_narrative(fragments, emotional_tone)
    if not narrative:
        logger.warning("梦境叙事为空，跳过")
        return None

    # Step 3: 投入热反思管道（Step 3 自动完成 Call 2 五维分类）
    cards_count = 0
    try:
        from lumen.core.reflection import enqueue_reflection
        from lumen.events.schema import ReflectionEvent, SourceType

        event = ReflectionEvent(
            source_type=SourceType.DIARY_ENTRY,
            timestamp=time.time(),
            content=narrative,
            summary=f"[梦境] {narrative[:200]}",
            session_id="dream",
            character_id=character_id,
            source_id=dream_id,
            metadata={
                "source": "deep_dream",
                "dream_id": dream_id,
                "recalled_fragments": len(fragments),
                "emotional_tone": emotional_tone,
            },
        )
        if enqueue_reflection(event):
            cards_count = -1
            logger.info(f"梦境叙事已投入热反思管道: {dream_id}")
    except Exception as e:
        logger.error(f"梦境叙事投入反思管道失败: {e}")

    duration_ms = (time.perf_counter() - t0) * 1000

    return DreamResult(
        dream_id=dream_id,
        character_id=character_id,
        recalled_count=len(fragments),
        narrative=narrative,
        cards_generated=cards_count,
        duration_ms=duration_ms,
    )


def _infer_emotional_tone(fragments: list[dict]) -> str:
    """从记忆碎片推断情感底色"""
    _tones = [
        ("anxiety", ["焦虑", "担心", "失踪", "失败", "紧张"]),
        ("joy", ["开心", "成功", "突破", "完成", "欣喜"]),
        ("sadness", ["失去", "悲伤", "离别", "遗憾", "忧伤"]),
        ("anger", ["愤怒", "不公", "背叛", "暴怒"]),
        ("anticipation", ["期待", "等待", "希望", "憧憬"]),
    ]
    for frag in fragments:
        content = frag.get("content", "")
        for tone, keywords in _tones:
            if any(kw in content for kw in keywords):
                return tone
    return "contemplative"
