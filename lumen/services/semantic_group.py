"""
T26 SemanticGroupService — 通用语义组基础设施

三维可配：(TDB, collection, type)，支持两类消费模式：
- "量尺"模式（compute_scores）：余弦相似度打分，给情绪/性格评估
- "调味料"模式（enhance_query）：加权平均混合向量，给知识库搜索偏置

向量持久化仿 VCP：向量文件单独存 + vector_id 指针 + words_hash 自动重算。
"""

import hashlib
import json
import logging
import os
import re
import time
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
VECTORS_DIR = os.path.join(DATA_DIR, "semantic_vectors")
DB_PATH = os.path.join(DATA_DIR, "history.db")

# 默认情绪关键词表（中英文混合，每组 20+ 词）
DEFAULT_EMOTION_KEYWORDS = {
    "anger": ["愤怒", "生气", "恼火", "暴怒", "愤慨", "怒火", "火大", "暴躁", "发怒", "激怒",
              "怒不可遏", "怒发冲冠", "勃然大怒", "怒气冲冲", "义愤填膺", "咬牙切齿", "暴跳如雷",
              "anger", "rage", "furious", "wrath", "irritated", "irate", "outrage", "indignant",
              "enraged", "livid", "fuming", "infuriated"],
    "fear": ["恐惧", "害怕", "畏惧", "恐慌", "惊恐", "恐怖", "胆怯", "毛骨悚然", "害怕极了",
             "畏缩", "惧怕", "魂飞魄散", "心惊胆战", "提心吊胆", "不寒而栗", "噤若寒蝉",
             "fear", "terrified", "dread", "panic", "scared", "frightened", "afraid",
             "horror", "terrifying", "petrified", "spooked", "alarmed"],
    "sadness": ["悲伤", "难过", "伤心", "悲哀", "哀伤", "悲痛", "忧伤", "沮丧", "郁郁寡欢",
                "痛心", "悲恸", "垂头丧气", "心灰意冷", "泪流满面", "万念俱灰", "以泪洗面",
                "sadness", "sorrow", "grief", "mourn", "melancholy", "depressed", "miserable",
                "heartbroken", "despondent", "wretched", "dismal", "gloomy"],
    "joy": ["喜悦", "开心", "高兴", "快乐", "欢喜", "兴奋", "欣喜", "欢乐", "欢欣鼓舞",
            "兴高采烈", "雀跃", "欣喜若狂", "眉开眼笑", "手舞足蹈", "乐不可支", "喜出望外",
            "joy", "happy", "delight", "glad", "elated", "ecstatic", "cheerful", "jubilant",
            "overjoyed", "thrilled", "excited", "euphoric"],
    "surprise": ["惊讶", "震惊", "意外", "惊奇", "诧异", "吃惊", "震撼", "目瞪口呆",
                 "惊愕", "错愕", "大吃一惊", "难以置信", "瞠目结舌", "始料未及",
                 "surprise", "shock", "astonished", "amazed", "stunned", "startled",
                 "dumbfounded", "flabbergasted", "aghast", "taken aback"],
    "disgust": ["厌恶", "反感", "恶心", "讨厌", "憎恶", "嫌弃", "受不了", "令人作呕",
                "鄙夷", "不屑", "嗤之以鼻", "深恶痛绝", "避之不及", "令人不齿",
                "disgust", "revulsion", "loathe", "detest", "repulsed", "sickened",
                "abhor", "despise", "repugnant", "nauseating", "revolting"],
    "trust": ["信任", "信赖", "相信", "放心", "靠谱", "可靠", "可信", "托付",
              "坦诚", "真诚", "毫无保留", "深信不疑", "推心置腹", "肝胆相照",
              "trust", "rely", "confide", "dependable", "faithful", "loyal",
              "trustworthy", "credible", "reliable", "devoted"],
    "anticipation": ["期待", "期望", "期盼", "展望", "憧憬", "渴望", "翘首以盼",
                     "拭目以待", "跃跃欲试", "迫不及待", "引颈期盼", "心向往之",
                     "anticipation", "expect", "await", "look forward", "eager",
                     "hopeful", "enthusiastic", "excited for", "counting on"],
}

DEFAULT_TOPIC_KEYWORDS = {
    "combat": ["战斗", "攻击", "武器", "剑", "刀", "弓箭", "魔法", "伤害", "防御", "格挡",
               "闪避", "冲锋", "斩击", "射击", "拳", "盾", "铠甲", "战场", "敌人", "对决",
               "combat", "attack", "weapon", "sword", "damage", "defense", "battle", "fight"],
    "romance": ["爱情", "恋爱", "浪漫", "心动", "告白", "约会", "亲吻", "拥抱", "情感",
                "思念", "牵挂", "温柔", "甜蜜", "深情", "倾慕", "钟情", "暧昧", "心动不已",
                "romance", "love", "romantic", "kiss", "hug", "affection", "passion", "date"],
}


def _get_conn():
    import sqlite3
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _ensure_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS semantic_groups (
            group_id TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'emotion',
            name TEXT NOT NULL,
            keywords TEXT NOT NULL DEFAULT '[]',
            vector_id TEXT NOT NULL DEFAULT '',
            scope_db TEXT NOT NULL DEFAULT 'knowledge.tdb',
            scope_collection TEXT DEFAULT NULL,
            weight REAL NOT NULL DEFAULT 1.0,
            words_hash TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sg_type ON semantic_groups(type)")
    conn.commit()


# 模块加载时建表
try:
    conn = _get_conn()
    _ensure_table(conn)
    conn.close()
except Exception as e:
    logger.warning(f"语义组表初始化失败: {e}")


def _compute_words_hash(keywords: list[str]) -> str:
    joined = ",".join(sorted(set(kw.strip().lower() for kw in keywords if kw.strip())))
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


def _vector_path(vector_id: str) -> str:
    os.makedirs(VECTORS_DIR, exist_ok=True)
    return os.path.join(VECTORS_DIR, f"{vector_id}.json")


def _load_vector(vector_id: str) -> Optional[list[float]]:
    if not vector_id:
        return None
    path = _vector_path(vector_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("vector")
    except Exception as e:
        logger.warning(f"加载向量文件失败 {vector_id}: {e}")
        return None


def _save_vector(vector_id: str, vector: list[float], group_id: str = ""):
    os.makedirs(VECTORS_DIR, exist_ok=True)
    path = _vector_path(vector_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"group_id": group_id, "vector_id": vector_id, "vector": vector}, f, ensure_ascii=False)


def _dot_product(a: list[float], b: list[float]) -> float:
    """L2 归一化前提下等价于余弦相似度（|a|=|b|=1 → cos = dot）

    省掉 norm 计算和 sqrt，约 2-3x 快于完整余弦。
    """
    if len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def _l2_normalize(v: list[float]) -> list[float]:
    norm = sum(x * x for x in v) ** 0.5
    if norm == 0:
        return v
    return [x / norm for x in v]


# ── 公开 API ──

async def precompute_vector(group_id: str) -> Optional[str]:
    """为语义组预计算向量并持久化"""
    from lumen.services.search.embedding import get_service

    conn = _get_conn()
    row = conn.execute("SELECT * FROM semantic_groups WHERE group_id = ?", (group_id,)).fetchone()
    conn.close()
    if not row:
        logger.warning(f"语义组不存在: {group_id}")
        return None

    keywords = json.loads(row["keywords"])
    if not keywords:
        return None

    new_hash = _compute_words_hash(keywords)
    if new_hash == row["words_hash"] and row["vector_id"] and os.path.exists(_vector_path(row["vector_id"])):
        return row["vector_id"]

    text = " ".join(keywords)
    backend = await get_service("knowledge")
    vector = await backend.encode(text)
    if not vector:
        logger.warning(f"语义组向量计算失败: {group_id}")
        return None

    old_vector_id = row["vector_id"]
    new_vector_id = f"{group_id}_{int(time.time() * 1000)}"
    _save_vector(new_vector_id, vector, group_id)

    conn = _get_conn()
    conn.execute(
        "UPDATE semantic_groups SET vector_id = ?, words_hash = ?, updated_at = datetime('now') WHERE group_id = ?",
        (new_vector_id, new_hash, group_id),
    )
    conn.commit()
    conn.close()

    if old_vector_id and old_vector_id != new_vector_id:
        old_path = _vector_path(old_vector_id)
        if os.path.exists(old_path):
            os.remove(old_path)

    logger.info(f"语义组向量已更新: {group_id} → {new_vector_id}")
    return new_vector_id


async def create_group(
    group_id: str,
    type_: str,
    name: str,
    keywords: list[str],
    scope_db: str = "knowledge.tdb",
    scope_collection: str = None,
    weight: float = 1.0,
    metadata: dict = None,
) -> str:
    """创建语义组并自动预计算向量"""
    conn = _get_conn()
    _ensure_table(conn)

    words_hash = _compute_words_hash(keywords)
    conn.execute(
        """INSERT OR REPLACE INTO semantic_groups
           (group_id, type, name, keywords, scope_db, scope_collection, weight, words_hash, metadata, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
        (group_id, type_, name, json.dumps(keywords, ensure_ascii=False), scope_db,
         scope_collection, weight, words_hash, json.dumps(metadata or {}, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()

    await precompute_vector(group_id)
    return group_id


async def delete_group(group_id: str) -> bool:
    """删除语义组并清理向量文件"""
    conn = _get_conn()
    row = conn.execute("SELECT vector_id FROM semantic_groups WHERE group_id = ?", (group_id,)).fetchone()
    if not row:
        conn.close()
        return False

    conn.execute("DELETE FROM semantic_groups WHERE group_id = ?", (group_id,))
    conn.commit()
    conn.close()

    if row["vector_id"]:
        path = _vector_path(row["vector_id"])
        if os.path.exists(path):
            os.remove(path)
    return True


async def update_keywords(group_id: str, keywords: list[str]) -> bool:
    """更新关键词并自动触发向量重算"""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM semantic_groups WHERE group_id = ?", (group_id,)).fetchone()
    if not row:
        conn.close()
        return False

    words_hash = _compute_words_hash(keywords)
    conn.execute(
        "UPDATE semantic_groups SET keywords = ?, words_hash = ?, updated_at = datetime('now') WHERE group_id = ?",
        (json.dumps(keywords, ensure_ascii=False), words_hash, group_id),
    )
    conn.commit()
    conn.close()

    await precompute_vector(group_id)
    return True


def list_groups(type_: str = None) -> list[dict]:
    """列出所有语义组"""
    conn = _get_conn()
    if type_:
        rows = conn.execute(
            "SELECT * FROM semantic_groups WHERE type = ? ORDER BY group_id", (type_,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM semantic_groups ORDER BY type, group_id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_group(group_id: str) -> Optional[dict]:
    """获取单个语义组"""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM semantic_groups WHERE group_id = ?", (group_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


async def compute_scores(query_vector: list[float], group_type: str) -> dict[str, float]:
    """量尺模式：计算查询向量与所有同类型语义组的余弦相似度

    Returns:
        {group_name: score, ...}  按分数降序
    """
    groups = list_groups(type_=group_type)
    if not groups:
        return {}

    scores = {}
    for g in groups:
        ref_vec = _load_vector(g["vector_id"])
        if not ref_vec:
            ref_vec_id = await precompute_vector(g["group_id"])
            if ref_vec_id:
                ref_vec = _load_vector(ref_vec_id)
        if ref_vec:
            scores[g["name"]] = round(_dot_product(query_vector, ref_vec), 4)

    return dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))


async def enhance_query(query_vector: list[float], activated_group_ids: list[str]) -> list[float]:
    """调味料模式：加权平均混合查询向量与激活语义组

    enhanced = query * 1.0 + g1 * w1 + g2 * w2 + ...
    返回前 L2 normalize（API embedding 是单位向量，加权平均后长度≠1）
    """
    groups = []
    for gid in activated_group_ids:
        g = get_group(gid)
        if g:
            groups.append(g)

    if not groups:
        return query_vector

    dim = len(query_vector)
    enhanced = list(query_vector)

    for g in groups:
        ref_vec = _load_vector(g["vector_id"])
        if not ref_vec:
            ref_vec_id = await precompute_vector(g["group_id"])
            if ref_vec_id:
                ref_vec = _load_vector(ref_vec_id)
        if not ref_vec or len(ref_vec) != dim:
            continue
        w = g["weight"]
        for i in range(dim):
            enhanced[i] += ref_vec[i] * w

    return _l2_normalize(enhanced)


def match_groups(text: str, group_type: str = None) -> dict[str, float]:
    """免费词匹配：遍历语义组关键词，计算包含率

    零成本，不调 embed。用于快速判定哪些 topic 组该激活。

    Returns:
        {group_id: match_ratio, ...}
    """
    groups = list_groups(type_=group_type)
    if not groups:
        return {}

    result = {}
    text_lower = text.lower()
    for g in groups:
        keywords = json.loads(g["keywords"]) if isinstance(g["keywords"], str) else g["keywords"]
        if not keywords:
            continue
        matched = sum(1 for kw in keywords if kw.lower() in text_lower)
        ratio = matched / len(keywords)
        if ratio > 0:
            result[g["group_id"]] = round(ratio, 3)

    return dict(sorted(result.items(), key=lambda x: x[1], reverse=True))


async def init_default_groups():
    """首次启动：预建 8 个情绪组 + 2 个 topic 示例组"""
    existing = list_groups()
    if existing:
        return

    logger.info("首次启动：初始化默认语义组...")

    # 8 情绪组（全局，不绑 collection）
    for emo_name, keywords in DEFAULT_EMOTION_KEYWORDS.items():
        group_id = f"emotion_{emo_name}"
        try:
            await create_group(
                group_id=group_id,
                type_="emotion",
                name=emo_name,
                keywords=list(keywords),
                scope_db="knowledge.tdb",
                scope_collection=None,
                weight=1.0,
            )
        except Exception as e:
            logger.warning(f"创建情绪组失败 {emo_name}: {e}")

    # 2 topic 示例组
    for topic_name, keywords in DEFAULT_TOPIC_KEYWORDS.items():
        group_id = f"topic_{topic_name}"
        try:
            await create_group(
                group_id=group_id,
                type_="topic",
                name=topic_name,
                keywords=list(keywords),
                scope_db="knowledge.tdb",
                scope_collection="rpg_rules",
                weight=1.0,
            )
        except Exception as e:
            logger.warning(f"创建 topic 组失败 {topic_name}: {e}")

    logger.info("默认语义组初始化完成")
