"""
Lumen - 记忆系统
会话结束时生成摘要，新会话开始时注入记忆
跨会话关键词搜索召回
"""

import logging

from lumen.services import history
from lumen.services.llm import chat
from lumen.services.context.token_estimator import estimate_text_tokens
from lumen.types.messages import Message

logger = logging.getLogger(__name__)

# 中英文停用词（高频但无语义价值的词）
_STOP_WORDS = {
    # 中文
    "的", "了", "是", "在", "我", "你", "他", "她", "它", "这", "那",
    "吗", "呢", "吧", "啊", "哦", "嗯", "好", "好的", "对", "不",
    "有", "和", "就", "也", "都", "要", "会", "可以", "能", "但",
    "什么", "怎么", "为什么", "一个", "一些", "这个", "那个",
    # 英文
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "can", "could", "should", "may", "might", "must",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "my", "your", "his", "its", "our", "their",
    "and", "or", "but", "if", "then", "so", "no", "not",
    "this", "that", "these", "those", "what", "which", "who",
    "how", "when", "where", "why",
    "yes", "yeah", "ok", "okay", "well", "just", "like", "really",
    "very", "too", "also", "still", "already",
}


async def generate_summary(messages: list[Message]) -> str:
    """调 AI 给一段对话生成摘要

    messages: 当前会话的消息列表（会去掉 system 消息）
    返回: 摘要文本，失败返回空字符串
    """
    # 只取用户和AI的对话，去掉 system 消息
    chat_msgs = [m for m in messages if m["role"] != "system"]

    if not chat_msgs:
        return ""

    # 把对话拼成文本，让 AI 做摘要
    conversation_text = ""
    for msg in chat_msgs:
        role_name = "用户" if msg["role"] == "user" else "AI"
        conversation_text += f"{role_name}: {msg['content']}\n"

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


def _extract_keywords(text: str, max_keywords: int = 5) -> list[str]:
    """从用户输入中提取搜索关键词（简单规则，不依赖分词库）"""
    import re

    # 提取中文词组（2-8字）和英文单词（3+字母）
    cn_words = re.findall(r'[\u4e00-\u9fff]{2,8}', text)
    en_words = re.findall(r'[a-zA-Z]{3,}', text)

    candidates = cn_words + [w.lower() for w in en_words]

    # 去停用词 + 去重 + 保留顺序
    seen = set()
    keywords = []
    for w in candidates:
        if w not in _STOP_WORDS and w not in seen:
            seen.add(w)
            keywords.append(w)
            if len(keywords) >= max_keywords:
                break

    return keywords


def get_relevant_memories(
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
