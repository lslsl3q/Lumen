"""
Lumen - 统一配置管理
所有配置项集中在这里，方便动态调整
"""

# 项目版本号（三处同步：config.py / package.json / tauri.conf.json）
__version__ = "0.0.5"

import os
import sys
from dotenv import load_dotenv
from openai import AsyncOpenAI

# 加载环境变量
load_dotenv()


def _validate_env():
    """验证必需的环境变量

    在启动时检查，而不是等到第一次 API 调用时才报错
    """
    required_vars = {
        "API_URL": "API 服务器地址",
        "API_KEY": "API 密钥",
        "MODEL": "你要用的模型名称（如 deepseek-chat、gemini-2.5-flash）",
    }

    missing = []
    empty = []

    for var_name, description in required_vars.items():
        value = os.getenv(var_name)
        if value is None:
            missing.append(f"  - {var_name} ({description})")
        elif value.strip() == "":
            empty.append(f"  - {var_name} ({description}) 为空")

    if missing or empty:
        error_parts = ["配置错误：缺少必需的环境变量"]
        if missing:
            error_parts.append("\n未设置：")
            error_parts.extend(missing)
        if empty:
            error_parts.append("\n已设置但为空：")
            error_parts.extend(empty)
        error_parts.append("\n请在项目根目录的 .env 文件中配置这些变量。")
        error_parts.append("\n示例 .env 文件：")
        error_parts.append("""
API_URL=https://api.example.com/v1
API_KEY=your_api_key_here
MODEL=gemini-2.5-flash
""")
        print("\n" + "\n".join(error_parts) + "\n", file=sys.stderr)
        sys.exit(1)


# 启动时验证环境变量
_validate_env()


# API 客户端（全局单例，异步版）
client = AsyncOpenAI(
    base_url=os.getenv("API_URL"),
    api_key=os.getenv("API_KEY"),
)


# 默认模型（在 .env 中必须配置，不设兜底）
DEFAULT_MODEL = os.getenv("MODEL")

# 摘要模型（用于 compact 压缩、记忆摘要等，可以和聊天模型不同）
# 留空则跟随角色/默认模型
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "")

# LLM API 超时时间（秒）
# 可以通过环境变量 LLM_TIMEOUT 覆盖
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

# ReAct 循环最大轮次（防止 AI 无限调用工具）
# 可以通过环境变量 MAX_TOOL_ITERATIONS 覆盖
MAX_TOOL_ITERATIONS = int(os.getenv("MAX_TOOL_ITERATIONS", "20"))

# 默认上下文窗口大小（tokens），角色级 context_size 未设置时使用
DEFAULT_CONTEXT_SIZE = int(os.getenv("DEFAULT_CONTEXT_SIZE", "8192"))

# WebSocket 推送通道设置
# 心跳间隔（秒），保持连接存活（应对休眠唤醒）
WS_HEARTBEAT_INTERVAL = float(os.getenv("WS_HEARTBEAT_INTERVAL", "30"))

# ── 嵌入模型配置（两阵营架构）─
EMBEDDING_ENABLED = os.getenv("EMBEDDING_ENABLED", "True").lower() in ("true", "1", "yes")

# 阵营 A：本地小模型 — 程序内置模块（memory/thinking_clusters/knowledge_sentences）
EMBEDDING_LOCAL_MODEL = os.getenv("EMBEDDING_LOCAL_MODEL", os.getenv("EMBEDDING_MODEL", "thenlper/gte-small-zh"))
EMBEDDING_LOCAL_DIM = int(os.getenv("EMBEDDING_LOCAL_DIM", "512"))

# 阵营 B：API 大模型 — 用户新建的知识库
EMBEDDING_API_URL = os.getenv("EMBEDDING_API_URL", "")
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "")
EMBEDDING_API_MODEL = os.getenv("EMBEDDING_API_MODEL", "")
EMBEDDING_API_DIM = int(os.getenv("EMBEDDING_API_DIM", os.getenv("KNOWLEDGE_EMBEDDING_DIM", "0")))

# 旧变量兼容导出（embedding.py 内部不再直接 import 这些，但保持向后兼容）
EMBEDDING_BACKEND = "local"
EMBEDDING_MODEL = EMBEDDING_LOCAL_MODEL
EMBEDDING_DIMENSIONS = EMBEDDING_LOCAL_DIM
KNOWLEDGE_EMBEDDING_BACKEND = os.getenv("KNOWLEDGE_EMBEDDING_BACKEND", "")  # 空=不启用
KNOWLEDGE_EMBEDDING_API_URL = os.getenv("KNOWLEDGE_EMBEDDING_API_URL", "") or EMBEDDING_API_URL
KNOWLEDGE_EMBEDDING_API_KEY = os.getenv("KNOWLEDGE_EMBEDDING_API_KEY", "") or EMBEDDING_API_KEY
KNOWLEDGE_EMBEDDING_API_MODEL = os.getenv("KNOWLEDGE_EMBEDDING_API_MODEL", "") or EMBEDDING_API_MODEL



# 知识库配置
VECTOR_STORE_DIR = os.getenv(
    "VECTOR_STORE_DIR",
    os.path.join(os.path.dirname(__file__), "data", "vectors"),
)
VECTOR_LOCAL_DIR = os.getenv(
    "VECTOR_LOCAL_DIR",
    os.path.join(VECTOR_STORE_DIR, "local"),
)
VECTOR_API_DIR = os.getenv(
    "VECTOR_API_DIR",
    os.path.join(VECTOR_STORE_DIR, "api"),
)
KNOWLEDGE_DB_PATH = os.getenv(
    "KNOWLEDGE_DB_PATH",
    os.path.join(VECTOR_API_DIR, "knowledge.tdb"),
)
KNOWLEDGE_SOURCE_DIR = os.getenv(
    "KNOWLEDGE_SOURCE_DIR",
    os.path.join(os.path.dirname(__file__), "data", "knowledge"),
)

# ── T23 动态知识库 ──
KNOWLEDGE_LIB_DIR = "data/知识库"
MANIFEST_PATH = os.path.join(KNOWLEDGE_LIB_DIR, "_manifest.json")

GRAPH_BACKUP_DIR = os.getenv(
    "GRAPH_BACKUP_DIR",
    os.path.join(os.path.dirname(__file__), "data", "graph"),
)

# T19 图谱系统
GRAPH_ENTITY_TYPES = ["Character", "Location", "Item", "Organization", "Event", "Concept"]
GRAPH_EXTRACT_MODEL = os.getenv("GRAPH_EXTRACT_MODEL", "")  # 空=跟随 DEFAULT_MODEL
GRAPH_RECALL_WEIGHT = float(os.getenv("GRAPH_RECALL_WEIGHT", "0.3"))
GRAPH_RECALL_TOP_K = int(os.getenv("GRAPH_RECALL_TOP_K", "10"))
GRAPH_RECALL_EXPAND_DEPTH = int(os.getenv("GRAPH_RECALL_EXPAND_DEPTH", "2"))

KNOWLEDGE_CHUNK_SIZE = int(os.getenv("KNOWLEDGE_CHUNK_SIZE", "300"))
KNOWLEDGE_CHUNK_OVERLAP = int(os.getenv("KNOWLEDGE_CHUNK_OVERLAP", "60"))

# PRF 伪相关反馈配置（T18 Stage 1→2 增强层）
PRF_ENABLED = os.getenv("PRF_ENABLED", "True").lower() in ("true", "1")
PRF_TOP_N = int(os.getenv("PRF_TOP_N", "5"))          # 取前 N 条结果的向量算均值
PRF_ALPHA = float(os.getenv("PRF_ALPHA", "0.7"))       # 原始查询向量权重
PRF_BETA = float(os.getenv("PRF_BETA", "0.3"))         # PRF 均值向量权重

# ── 稀疏向量（T25: doubao sparse embedding）──
SPARSE_EMBEDDING_ENABLED = os.getenv("SPARSE_EMBEDDING_ENABLED", "True").strip().lower() in ("true", "1", "yes")

# 句子级检索配置（T18 Stage 3+4）
KNOWLEDGE_SENTENCE_DB_PATH = os.getenv(
    "KNOWLEDGE_SENTENCE_DB_PATH",
    os.path.join(VECTOR_LOCAL_DIR, "knowledge_sentences.tdb"),
)
KNOWLEDGE_SENTENCE_LEVEL = os.getenv("KNOWLEDGE_SENTENCE_LEVEL", "True").lower() in ("true", "1")
KNOWLEDGE_SENTENCE_TOP_N = int(os.getenv("KNOWLEDGE_SENTENCE_TOP_N", "5"))
KNOWLEDGE_SENTENCE_WINDOW = int(os.getenv("KNOWLEDGE_SENTENCE_WINDOW", "1"))

# Token 预算配置（知识库检索注入的 token 上限）
KNOWLEDGE_PLACEHOLDER_BUDGET = int(os.getenv("KNOWLEDGE_PLACEHOLDER_BUDGET", "800"))   # 占位符 {{}}/[[]] 共享预算
KNOWLEDGE_SEMANTIC_BUDGET = int(os.getenv("KNOWLEDGE_SEMANTIC_BUDGET", "500"))          # 语义路由自动注入预算

# AI 日记/档案配置（daily_note 工具系列）
# 日记按 Agent 分文件夹：data/knowledge/agents/{agent_id}/diary/
DAILY_NOTE_DIR = os.getenv(
    "DAILY_NOTE_DIR",
    os.path.join(os.path.dirname(__file__), "data", "knowledge", "agents"),
)

# Agent 知识库配置（阵营 B，大模型向量）
AGENT_KNOWLEDGE_DB_PATH = os.getenv(
    "AGENT_KNOWLEDGE_DB_PATH",
    os.path.join(VECTOR_API_DIR, "agent_knowledge.tdb"),
)

# 思维簇配置
THINKING_CLUSTERS_DIR = os.getenv(
    "THINKING_CLUSTERS_DIR",
    os.path.join(os.path.dirname(__file__), "data", "thinking_clusters"),
)
THINKING_CLUSTERS_DB_PATH = os.getenv(
    "THINKING_CLUSTERS_DB_PATH",
    os.path.join(VECTOR_LOCAL_DIR, "thinking_clusters.tdb"),
)

def get_model(character_config: dict = None) -> str:
    """获取当前应该使用的模型

    Args:
        character_config: 角色配置字典（可选）
                         如果角色配置里有 model 字段且非空，就用角色的

    Returns:
        模型名称字符串
    """
    if character_config and character_config.get("model"):
        return character_config["model"]
    return DEFAULT_MODEL


def get_summary_model(character_config: dict = None) -> str:
    """获取摘要/压缩时使用的模型

    优先级：SUMMARY_MODEL 环境变量 > 角色配置的 model > DEFAULT_MODEL

    Args:
        character_config: 角色配置字典（可选）

    Returns:
        模型名称字符串
    """
    if SUMMARY_MODEL:
        return SUMMARY_MODEL
    return get_model(character_config)


def get_context_size(character_config: dict = None) -> int:
    """获取当前应该使用的上下文窗口大小

    Args:
        character_config: 角色配置字典（可选）

    Returns:
        上下文窗口大小（tokens）
    """
    if character_config and character_config.get("context_size"):
        return character_config["context_size"]
    return DEFAULT_CONTEXT_SIZE


# ── 日志配置 ──
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_DIR = os.path.join(os.path.dirname(__file__), "data", "logs")
LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", "5242880"))    # 默认 5MB
LOG_BACKUP_COUNT = int(os.getenv("LOG_BACKUP_COUNT", "3"))   # 保留 3 个轮转文件


def setup_logging():
    """初始化日志系统（控制台 + 文件双输出，按大小轮转）

    在 api/main.py 启动时调用一次。
    已有的 33 个 logger = logging.getLogger(__name__) 零改动。
    """
    import logging.handlers

    os.makedirs(LOG_DIR, exist_ok=True)

    # 格式：时间 | 级别 | 模块 | 消息
    file_fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )

    # 控制台（简洁，不带时间戳）
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("[%(name)s] %(message)s"))

    # 文件（完整，按大小轮转）
    file_handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "lumen.log"),
        maxBytes=LOG_MAX_BYTES,
        backupCount=LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(file_fmt)

    # 配置根 logger
    root = logging.getLogger()
    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    root.addHandler(console)
    root.addHandler(file_handler)
