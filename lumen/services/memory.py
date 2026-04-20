"""
Lumen - 记忆系统
会话结束时生成摘要，新会话开始时注入记忆
跨会话语义搜索（向量优先，jieba 关键词回退）
"""

import logging
import os

import jieba
import jieba.analyse

jieba.setLogLevel(logging.WARNING)

from lumen.services import history
from lumen.services.llm import chat
from lumen.services.context.token_estimator import estimate_text_tokens
from lumen.types.messages import Message

logger = logging.getLogger(__name__)

# 停用词：jieba 的 POS 过滤已经去掉了大部分虚词，这里兜底
_STOP_WORDS = {
    "的", "了", "是", "在", "我", "你", "他", "她", "它", "这", "那",
    "吗", "呢", "吧", "啊", "哦", "嗯", "好", "好的", "对", "不",
    "什么", "怎么", "为什么", "一个", "一些", "这个", "那个",
}

# jieba TF-IDF 只保留这些词性的词
_MEANINGFUL_POS = ('n', 'nr', 'ns', 'nt', 'nz', 'v', 'vn', 'eng')

# 自定义词典路径
_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_USER_DICT_PATH = os.path.join(_DATA_DIR, "user_dict.txt")

# 词典加载状态（只加载一次，除非显式 reload）
_dict_loaded = False


async def generate_summary(messages: list[Message]) -> str:
    """调 AI 给一段对话生成摘要

    messages: 当前会话的消息列表（会去掉 system 消息）
    返回: 摘要文本，失败返回空字符串
    """
    # 只取用户和AI的对话，去掉 system 消息
    chat_msgs = [m for m in messages if m["role"] != "system"]

    if not chat_msgs:
        return ""

    # 把对话拼成文本，让 AI 做摘要（限制长度，防止超出模型上下文）
    conversation_text = ""
    MAX_SUMMARY_CHARS = 8000
    for msg in chat_msgs:
        role_name = "用户" if msg["role"] == "user" else "AI"
        line = f"{role_name}: {msg['content']}\n"
        if len(conversation_text) + len(line) > MAX_SUMMARY_CHARS:
            conversation_text += f"{role_name}: ...(已截断)\n"
            break
        conversation_text += line

    # 调 AI 生成摘要
    try:
        from lumen.config import get_summary_model
        model = get_summary_model()

        response = await chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个对话摘要助手。请根据以下对话内容，提取关键信息并生成简洁的摘要。\n"
                        "摘要应该包含：\n"
                        "- 用户的偏好、特征、兴趣\n"
                        "- 讨论的主要话题\n"
                        "- 重要的结论或决定\n"
                        "用中文，控制在2-3句话以内。"
                    ),
                },
                {"role": "user", "content": f"<conversation>\n{conversation_text}</conversation>"},
            ],
            model=model,
            stream=False,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # 摘要失败不影响正常使用，记录错误后静默跳过
        logger.error(f"摘要生成失败: {e}")
        return ""


async def summarize_session(session_id: str, character_id: str, messages: list[Message]):
    """给一个会话生成摘要并保存到数据库"""
    summary = await generate_summary(messages)
    if summary:
        history.save_summary(session_id, character_id, summary)
        logger.info(f"已保存会话 {session_id} 的摘要")


def get_memory_context(character_id: str) -> str:
    """读取记忆并拼成注入文本

    返回格式化的记忆文本，没有记忆时返回空字符串
    """
    summaries = history.load_summaries(character_id, limit=3)

    if not summaries:
        return ""

    # 拼成 XML 格式
    lines = []
    for session_id, summary in summaries:
        lines.append(f"会话 {session_id}: {summary}")

    memory_text = "<memory>\n<过去的对话摘要>\n" + "\n".join(lines) + "\n</过去的对话摘要>\n</memory>"
    return memory_text


def reload_user_dict() -> int:
    """加载自定义词典（角色名 + 世界书关键词 + 用户词典）

    首次调用时加载，后续调用跳过（除非强制重新加载）。
    返回加载的词数。
    """
    global _dict_loaded
    if _dict_loaded:
        return 0

    count = 0
    import jieba

    # 1. 加载用户词典文件
    if os.path.exists(_USER_DICT_PATH):
        try:
            jieba.load_userdict(_USER_DICT_PATH)
            with open(_USER_DICT_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        count += 1
        except Exception as e:
            logger.warning(f"加载用户词典失败: {e}")

    # 2. 角色名 → 人名词典
    try:
        from lumen.prompt.character import CHARACTERS_DIR
        if os.path.exists(CHARACTERS_DIR):
            for filename in os.listdir(CHARACTERS_DIR):
                if filename.endswith(".json"):
                    char_id = filename[:-5]  # 去掉 .json
                    jieba.add_word(char_id, freq=100, tag="nr")
                    count += 1
    except Exception:
        pass

    # 3. 世界书关键词 → 专有名词词典
    try:
        from lumen.prompt.worldbook_store import list_worldbooks
        for entry in list_worldbooks():
            for kw in entry.get("keywords", []):
                if kw and len(kw) >= 2:
                    jieba.add_word(kw, freq=100, tag="nz")
                    count += 1
    except Exception:
        pass

    _dict_loaded = True
    if count > 0:
        logger.info(f"jieba 自定义词典已加载: {count} 个词")
    return count


def _extract_keywords(text: str, max_keywords: int = 8) -> list[str]:
    """从用户输入中提取搜索关键词（jieba TF-IDF + 词性过滤）"""
    try:
        keywords = jieba.analyse.extract_tags(
            text,
            topK=max_keywords,
            allowPOS=_MEANINGFUL_POS,
        )
        return [kw for kw in keywords if kw not in _STOP_WORDS and len(kw) >= 2]
    except Exception as e:
        logger.warning(f"jieba TF-IDF 提取失败，回退到基础分词: {e}")
        try:
            return [w for w in jieba.cut(text) if w not in _STOP_WORDS and len(w) >= 2][:max_keywords]
        except Exception:
            return []


async def vectorize_message(message_id: int, content: str, role: str,
                            session_id: str, character_id: str, created_at: str = ""):
    """异步计算消息向量并存入 TriviumDB（不阻塞对话流）"""
    try:
        from lumen.services import embedding
        vector = await embedding.encode(content)
        if vector:
            from lumen.services import vector_store
            vector_store.insert_vector(
                vector, role, content, session_id, character_id, message_id, created_at,
            )
    except Exception as e:
        logger.debug(f"向量计算跳过 (msg {message_id}): {e}")


async def get_relevant_memories(
    user_input: str,
    character_id: str,
    token_budget: int = 300,
    auto_summarize: bool = False,
) -> tuple[str, list[dict]]:
    """跨会话记忆召回（向量语义搜索优先，jieba 关键词回退）

    Args:
        user_input: 当前用户输入
        character_id: 角色ID
        token_budget: 记忆注入的 token 上限
        auto_summarize: 超预算时是否自动总结（默认截断）

    Returns:
        (注入文本, 召回记录列表)
    """
    from lumen.services import embedding

    # 尝试加载模型
    if not embedding.is_available() and not embedding._failed:
        await embedding.ensure_loaded()

    # 向量语义搜索
    if embedding.is_available():
        query_vector = await embedding.encode(user_input)
        if query_vector:
            from lumen.services import vector_store
            hits = vector_store.search_similar(query_vector, character_id)

            recall_log = [{
                "keyword": "(语义搜索)",
                "source": "sqlite",
                "results": len(hits),
                "tokens": 0,
                "messages": [{
                    "role": h["role"],
                    "content": h["content"][:500],
                    "session_id": h["session_id"],
                    "created_at": h.get("created_at", ""),
                } for h in hits],
            }]

            if not hits:
                fallback = get_memory_context(character_id)
                if fallback:
                    fallback_tokens = estimate_text_tokens(fallback)
                    recall_log.append({
                        "keyword": "(fallback: 最近摘要)",
                        "source": "summary",
                        "results": 1,
                        "tokens": fallback_tokens,
                        "messages": [],
                    })
                    return fallback, recall_log
                return "", recall_log

            # 按 token 预算裁剪
            sorted_hits = sorted(hits, key=lambda h: h.get("created_at", ""), reverse=True)
            selected = []
            used_tokens = 0
            for hit in sorted_hits:
                role_label = "用户" if hit["role"] == "user" else "AI"
                line = f"[会话 {hit['session_id']}] {role_label}: {hit['content'][:200]}"
                line_tokens = estimate_text_tokens(line)
                if used_tokens + line_tokens > token_budget:
                    break
                selected.append(line)
                used_tokens += line_tokens

            if not selected:
                return "", recall_log

            recall_log[0]["tokens"] = used_tokens
            output = "<relevant_history>\n" + "\n".join(selected) + "\n</relevant_history>"
            return output, recall_log

    # 回退：jieba 关键词搜索
    return _get_relevant_memories_jieba(user_input, character_id, token_budget, auto_summarize)


def _get_relevant_memories_jieba(
    user_input: str,
    character_id: str,
    token_budget: int = 300,
    auto_summarize: bool = False,
) -> tuple[str, list[dict]]:
    """基于关键词搜索历史消息，返回格式化的记忆文本

    Args:
        user_input: 当前用户输入
        character_id: 角色ID
        token_budget: 记忆注入的 token 上限
        auto_summarize: 超预算时是否自动总结（默认截断）

    Returns:
        (注入文本, 召回记录列表)
        召回记录: [{"keyword": ..., "source": "sqlite", "results": N, "tokens": N}, ...]
    """
    reload_user_dict()
    keywords = _extract_keywords(user_input)
    recall_log = []

    # 关键词提取失败 → fallback 到最近摘要
    if not keywords:
        fallback = get_memory_context(character_id)
        if fallback:
            fallback_tokens = estimate_text_tokens(fallback)
            recall_log.append({
                "keyword": "(fallback: 最近摘要)",
                "source": "summary",
                "results": 1,
                "tokens": fallback_tokens,
            })
        return fallback, recall_log

    # 搜索每个关键词
    all_hits = {}  # (session_id, content[:100]) -> hit dict，去重用
    for kw in keywords:
        hits = history.search_messages(kw, character_id, limit=5)
        kw_messages = []
        kw_result_count = 0
        for hit in hits:
            key = (hit["session_id"], hit["content"][:100])
            if key not in all_hits:
                all_hits[key] = hit
                kw_result_count += 1
                kw_messages.append({
                    "role": hit["role"],
                    "content": hit["content"][:500],
                    "session_id": hit["session_id"],
                    "created_at": hit.get("created_at", ""),
                })
        recall_log.append({
            "keyword": kw,
            "source": "sqlite",
            "results": kw_result_count,
            "tokens": 0,
            "messages": kw_messages,
        })

    if not all_hits:
        return "", recall_log

    # 按 token 预算裁剪
    sorted_hits = sorted(all_hits.values(), key=lambda h: h.get("created_at", ""), reverse=True)
    selected = []
    used_tokens = 0

    for hit in sorted_hits:
        role_label = "用户" if hit["role"] == "user" else "AI"
        line = f"[会话 {hit['session_id']}] {role_label}: {hit['content'][:200]}"
        line_tokens = estimate_text_tokens(line)

        if used_tokens + line_tokens > token_budget:
            break

        selected.append(line)
        used_tokens += line_tokens

    if not selected:
        return "", recall_log

    # 更新 recall_log 的 token 统计
    total_tokens = used_tokens
    for entry in recall_log:
        if entry.get("source") == "sqlite":
            entry["tokens"] = total_tokens

    output = "<relevant_history>\n" + "\n".join(selected) + "\n</relevant_history>"
    return output, recall_log
