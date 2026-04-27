"""
Lumen - 缓冲区整理管线
从 buffer.tdb 取出 pending 条目 → LLM 批量提炼 → 生成 MD + 图谱数据 → 等待用户审批

一次 LLM 调用完成：话题拆分 + 文本提炼 + TDB 路由 + 实体/关系提取
"""

import json
import os
import time
import logging
from typing import Optional

from lumen.services.llm import chat
from lumen.types.messages import Message

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_REGISTRY_PATH = os.path.join(_DATA_DIR, "tdb_registry.json")

# ── Prompt ──

CONSOLIDATION_PROMPT = """你是一个记忆整理助手。你的任务是从以下对话记录中提炼出有价值的知识卡片和图谱数据。

## 输入

### TDB 注册表（目标知识库列表）
{tdb_registry}

### 原始对话记录（按时间排列，来源包括聊天和日记）
{buffer_messages}

## 任务

1. **话题识别**：从对话中识别出所有独立的话题。话题之间可能跨越不同时间、不同会话。
2. **提炼**：每个话题提炼为一条知识卡片，去除废话和重复，保留核心信息。
3. **路由**：根据 TDB 注册表判断每条卡片应该存入哪个 TDB。
4. **图谱提取**：从对话中提取涉及的实体和实体间关系。

## 输出格式（严格 JSON，不要包含 markdown 代码块标记）

{{
  "cards": [
    {{
      "topic": "话题名称",
      "content": "提炼后的知识文本（完整、自包含，脱离原始对话也能理解）",
      "category": "knowledge_static|knowledge_dynamic|event|experience|relation",
      "target_tdb": "knowledge",
      "tags": ["标签1", "标签2"],
      "importance": 3,
      "source_indices": [0, 5, 12]
    }}
  ],
  "entities": [
    {{
      "name": "实体名",
      "type": "人物|地点|组织|概念|技术|事件",
      "description": "实体的简要描述",
      "target_tdb": "knowledge"
    }}
  ],
  "relations": [
    {{
      "src": "源实体名",
      "dst": "目标实体名",
      "label": "关系描述（动词短语）",
      "fact": "完整事实陈述",
      "target_tdb": "knowledge"
    }}
  ]
}}

## 规则

- **拆分优先于合并**：拿不准是同一个话题还是两个话题时，拆成两条。
- **路由参考注册表的 description 和 keywords**。
- **实体提取要保守**：只提取明确提到、有具体信息的实体。
- **关系必须有方向**：src → label → dst，label 是动词短语。
- **content 要自包含**：不能只写"他喜欢编程"，要写完整上下文。
- **一条消息可以贡献给多个话题**：source_indices 允许交叉。
- **如果对话内容全是废话/寒暄/无实质信息**：返回空的 cards 和 entities 数组。
"""


# ── 注册表 ──

def load_registry() -> dict:
    """加载 TDB 注册表"""
    if not os.path.exists(_REGISTRY_PATH):
        return {"knowledge": {
            "description": "通用知识库",
            "keywords": [],
        }}
    try:
        with open(_REGISTRY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"加载 TDB 注册表失败: {e}")
        return {"knowledge": {"description": "通用知识库", "keywords": []}}


# ── 数据结构 ──

class Card:
    __slots__ = ("topic", "content", "category", "target_tdb", "tags", "importance", "source_indices")

    def __init__(self, data: dict):
        self.topic = data.get("topic", "")
        self.content = data.get("content", "")
        self.category = data.get("category", "knowledge_static")
        self.target_tdb = data.get("target_tdb", "knowledge")
        self.tags = data.get("tags", [])
        self.importance = data.get("importance", 3)
        self.source_indices = data.get("source_indices", [])


class Entity:
    __slots__ = ("name", "type", "description", "target_tdb")

    def __init__(self, data: dict):
        self.name = data.get("name", "")
        self.type = data.get("type", "概念")
        self.description = data.get("description", "")
        self.target_tdb = data.get("target_tdb", "knowledge")


class Relation:
    __slots__ = ("src", "dst", "label", "fact", "target_tdb")

    def __init__(self, data: dict):
        self.src = data.get("src", "")
        self.dst = data.get("dst", "")
        self.label = data.get("label", "")
        self.fact = data.get("fact", "")
        self.target_tdb = data.get("target_tdb", "knowledge")


class ConsolidationResult:
    def __init__(self, data: dict):
        self.cards = [Card(c) for c in data.get("cards", [])]
        self.entities = [Entity(e) for e in data.get("entities", [])]
        self.relations = [Relation(r) for r in data.get("relations", [])]


# ── 格式化 buffer 消息 ──

def format_buffer_messages(items: list[tuple[int, dict]]) -> str:
    """把 buffer 条目格式化为 LLM 可读的文本

    items: [(node_id, payload), ...]
    """
    lines = []
    for idx, (node_id, payload) in enumerate(items):
        source = payload.get("source", "unknown")
        content = payload.get("content", "")
        created = payload.get("created_at", "")
        role = "用户" if payload.get("extra_payload", {}).get("role") == "user" else "AI"
        lines.append(f"[{idx}] ({created}, {source}, {role}) {content}")
    return "\n".join(lines)


# ── LLM 调用 ──

async def call_llm_consolidate(
    buffer_items: list[tuple[int, dict]],
    model: str = "",
) -> Optional[ConsolidationResult]:
    """调用 LLM 批量提炼 buffer 内容

    Args:
        buffer_items: [(node_id, payload), ...]
        model: 使用的模型（空=默认聊天模型）

    Returns:
        ConsolidationResult，失败返回 None
    """
    if not buffer_items:
        return None

    registry = load_registry()
    messages_text = format_buffer_messages(buffer_items)

    registry_str = json.dumps(registry, ensure_ascii=False, indent=2)
    prompt_text = CONSOLIDATION_PROMPT.format(
        tdb_registry=registry_str,
        buffer_messages=messages_text,
    )

    # 选模型
    if not model:
        from lumen.services.runtime_config import get
        model = get("buffer_consolidation_model", "")
    if not model:
        from lumen.config import get_chat_model
        model = get_chat_model()

    try:
        response = await chat(
            messages=[
                {"role": "system", "content": "你是一个精准的记忆整理助手。只输出 JSON，不要输出任何其他内容。"},
                {"role": "user", "content": prompt_text},
            ],
            model=model,
            stream=False,
        )
        raw = response.choices[0].message.content.strip()

        # 去掉可能的 markdown 代码块标记
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

        parsed = json.loads(raw)
        result = ConsolidationResult(parsed)

        logger.info(
            f"整理完成: {len(result.cards)} 张卡片, "
            f"{len(result.entities)} 个实体, {len(result.relations)} 条关系"
        )
        return result

    except json.JSONDecodeError as e:
        logger.error(f"LLM 输出 JSON 解析失败: {e}")
        return None
    except Exception as e:
        logger.error(f"整理 LLM 调用失败: {e}")
        return None


# ── MD 文件生成 ──

def generate_md_file(card: Card, buffer_items: list[tuple[int, dict]]) -> str:
    """为知识卡片生成 MD 文件

    Returns:
        生成的文件名（相对路径）
    """
    tdb_name = card.target_tdb
    md_dir = os.path.join(_DATA_DIR, tdb_name, "from_chat")
    os.makedirs(md_dir, exist_ok=True)

    now_str = time.strftime("%Y-%m-%dT%H:%M:%S")
    timestamp = str(int(time.time()))[-6:]
    filename = f"{now_str.replace(':', '').replace('T', '_')}-card{timestamp}.md"
    filepath = os.path.join(md_dir, filename)

    # 收集来源消息
    source_lines = []
    for idx in card.source_indices:
        if idx < len(buffer_items):
            _, payload = buffer_items[idx]
            source_lines.append(
                f"  - [{payload.get('source', '')}] "
                f"{payload.get('content', '')[:100]}"
            )

    lines = [
        f"[{now_str}] {card.category} | 重要度: {card.importance}",
        "",
        f"## {card.topic}",
        "",
        card.content,
    ]
    if card.tags:
        lines.append(f"\nTag: {', '.join(card.tags)}")
    if source_lines:
        lines.append(f"\n来源 ({len(source_lines)} 条):")
        lines.extend(source_lines)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return f"{tdb_name}/from_chat/{filename}"


# ── 主入口 ──

async def run_consolidation(
    buffer_items: list[tuple[int, dict]] | None = None,
    model: str = "",
) -> dict:
    """运行完整的整理管线

    Args:
        buffer_items: [(node_id, payload), ...]  指定条目，None=全部 pending
        model: 使用的模型

    Returns:
        {"cards": N, "entities": N, "relations": N, "md_files": [...], "errors": N}
    """
    # 取 buffer pending 条目
    if buffer_items is None:
        from lumen.services.buffer import _get_db
        db = _get_db()
        buffer_items = []
        for nid in db.all_node_ids():
            try:
                node = db.get(nid)
            except Exception:
                continue
            if not node:
                continue
            payload = node.payload if hasattr(node, "payload") else {}
            if payload.get("status") == "pending":
                buffer_items.append((nid, payload))

    if not buffer_items:
        return {"cards": 0, "entities": 0, "relations": 0, "md_files": [], "errors": 0}

    # LLM 提炼
    result = await call_llm_consolidate(buffer_items, model=model)
    if result is None:
        return {"cards": 0, "entities": 0, "relations": 0, "md_files": [], "errors": len(buffer_items)}

    # 生成 MD 文件
    md_files = []
    for card in result.cards:
        try:
            path = generate_md_file(card, buffer_items)
            md_files.append(path)
        except Exception as e:
            logger.error(f"MD 文件生成失败: {e}")

    # 存储图谱数据（draft 状态）
    graph_stored = 0
    for entity in result.entities:
        try:
            _store_entity_draft(entity)
            graph_stored += 1
        except Exception as e:
            logger.debug(f"实体存储跳过: {e}")

    for relation in result.relations:
        try:
            _store_relation_draft(relation)
        except Exception as e:
            logger.debug(f"关系存储跳过: {e}")

    # 标记 buffer 条目为 processing
    from lumen.services.buffer import update_status
    processed_node_ids = set()
    for card in result.cards:
        for idx in card.source_indices:
            if idx < len(buffer_items):
                node_id, _ = buffer_items[idx]
                if node_id not in processed_node_ids:
                    update_status(node_id, "processing")
                    processed_node_ids.add(node_id)

    logger.info(
        f"整理管线完成: {len(result.cards)} 张卡片, {len(md_files)} 个 MD, "
        f"{graph_stored} 个实体, {len(processed_node_ids)} 条 buffer 标记 processing"
    )

    return {
        "cards": len(result.cards),
        "entities": len(result.entities),
        "relations": len(result.relations),
        "md_files": md_files,
        "errors": 0,
    }


def _store_entity_draft(entity: Entity) -> None:
    """存实体到目标 TDB（draft 状态）"""
    from lumen.api.routes.graph import _get_tdb
    import random

    try:
        db = _get_tdb(entity.target_tdb)
    except Exception:
        return

    dim = db.dim if hasattr(db, "dim") else 512
    vector = [random.gauss(0, 0.01) for _ in range(dim)]

    payload = {
        "name": entity.name,
        "type": entity.type,
        "description": entity.description,
        "status": "draft",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    db.insert(vector, payload)
    db.flush()


def _store_relation_draft(relation: Relation) -> None:
    """存关系到目标 TDB（draft 状态）

    注：需要先找到 src 和 dst 的节点 ID。draft 实体可能刚创建。
    """
    from lumen.api.routes.graph import _get_tdb

    try:
        db = _get_tdb(relation.target_tdb)
    except Exception:
        return

    # 按 name 查找节点
    src_id = _find_node_by_name(db, relation.src)
    dst_id = _find_node_by_name(db, relation.dst)

    if src_id is not None and dst_id is not None:
        db.link(src_id, dst_id, label=relation.label, weight=1.0)
        db.flush()


def _find_node_by_name(db, name: str) -> Optional[int]:
    """在 TDB 中按 payload.name 查找节点"""
    for nid in db.all_node_ids():
        try:
            node = db.get(nid)
        except Exception:
            continue
        if not node:
            continue
        payload = node.payload if hasattr(node, "payload") else {}
        if payload.get("name") == name:
            return nid
    return None
