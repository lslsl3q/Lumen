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

KNOWLEDGE_EMBEDDING_BACKEND = os.getenv("KNOWLEDGE_EMBEDDING_BACKEND", "")  # 空=不启用
KNOWLEDGE_EMBEDDING_API_URL = os.getenv("KNOWLEDGE_EMBEDDING_API_URL", "") or EMBEDDING_API_URL
KNOWLEDGE_EMBEDDING_API_KEY = os.getenv("KNOWLEDGE_EMBEDDING_API_KEY", "") or EMBEDDING_API_KEY
KNOWLEDGE_EMBEDDING_API_MODEL = os.getenv("KNOWLEDGE_EMBEDDING_API_MODEL", "") or EMBEDDING_API_MODEL



# ── 数据目录（按用途分层）──
# data/ 下的结构：db/ tdb/ config/ assets/ state/ graph/ gm/ logs/

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# 子目录
DB_DIR = os.path.join(DATA_DIR, "db")                       # SQLite 数据库
TDB_DIR = os.path.join(DATA_DIR, "tdb")                     # TriviumDB 向量库
TDB_API_DIR = os.path.join(TDB_DIR, "api")                  # API 嵌入阵营
TDB_LOCAL_DIR = os.path.join(TDB_DIR, "local")              # 本地嵌入阵营
CONFIG_DIR = os.path.join(DATA_DIR, "config")               # 可编辑配置
ASSETS_DIR = os.path.join(DATA_DIR, "assets")               # 用户资源
STATE_DIR = os.path.join(DATA_DIR, "state")                 # 运行时状态
WORLDBOOKS_DIR = os.path.join(DATA_DIR, "worldbooks")       # 世界书词条
SKILLS_DIR = os.path.join(DATA_DIR, "skills")               # 技能定义
CHARACTERS_DIR = os.path.join(DATA_DIR, "characters")       # 角色配置

# SQLite 数据库
HISTORY_DB = os.path.join(DB_DIR, "history.db")
PERMISSIONS_DB = os.path.join(DB_DIR, "permissions.db")
WORLD_STATE_DB = os.path.join(DB_DIR, "world_state.db")
THEME_DB = os.path.join(DB_DIR, "themes.db")
WRITING_DB = os.path.join(DB_DIR, "writing.db")
SEARCH_INDEX_DB = os.path.join(DB_DIR, "search_index.db")
GRAPH_META_DB = os.path.join(DB_DIR, "graph_meta.db")

# TriviumDB
KNOWLEDGE_DB_PATH = os.getenv("KNOWLEDGE_DB_PATH", os.path.join(TDB_API_DIR, "knowledge.tdb"))
AGENT_KNOWLEDGE_DB_PATH = os.getenv("AGENT_KNOWLEDGE_DB_PATH", os.path.join(TDB_API_DIR, "agent_knowledge.tdb"))

# 知识库源文件
KNOWLEDGE_SOURCE_DIR = os.getenv("KNOWLEDGE_SOURCE_DIR", os.path.join(ASSETS_DIR, "knowledge", "knowledge"))
KNOWLEDGE_LIB_DIR = os.path.join(ASSETS_DIR, "knowledge")

# 配置文件
MCP_CONFIG_PATH = os.path.join(CONFIG_DIR, "mcp_servers.json")
RUNTIME_CONFIG_PATH = os.path.join(CONFIG_DIR, "runtime_config.json")
USER_DICT_PATH = os.path.join(CONFIG_DIR, "user_dict.txt")
RERANK_CONFIG_PATH = os.path.join(CONFIG_DIR, "rerank_providers.json")
THINKING_CLUSTERS_DIR = os.getenv("THINKING_CLUSTERS_DIR", os.path.join(CONFIG_DIR, "thinking_clusters"))
THINKING_CLUSTERS_DB_PATH = os.getenv("THINKING_CLUSTERS_DB_PATH", os.path.join(TDB_LOCAL_DIR, "thinking_clusters.tdb"))

# 用户资源
AVATARS_DIR = os.path.join(ASSETS_DIR, "avatars")

# 运行时状态
ACTIVE_PERSONA_FILE = os.path.join(STATE_DIR, "active_persona.json")
DREAM_STATE_FILE = os.path.join(STATE_DIR, "dream_state.json")
SEMANTIC_VECTORS_DIR = os.path.join(STATE_DIR, "semantic_vectors")
FILE_WORKSPACES_PATH = os.path.join(STATE_DIR, "file_workspaces.json")

# 图谱
GRAPH_BACKUP_DIR = os.getenv("GRAPH_BACKUP_DIR", os.path.join(DATA_DIR, "graph"))

# 日记按 Agent 分文件夹：assets/knowledge/agent_knowledge/{agent_id}/diary/
DAILY_NOTE_DIR = os.getenv("DAILY_NOTE_DIR", os.path.join(ASSETS_DIR, "knowledge", "agent_knowledge"))

# 句子级检索
KNOWLEDGE_SENTENCE_DB_PATH = os.getenv("KNOWLEDGE_SENTENCE_DB_PATH", os.path.join(TDB_LOCAL_DIR, "knowledge_sentences.tdb"))

# 兼容旧名（逐步淘汰，新代码用 TDB_API_DIR / TDB_LOCAL_DIR）
VECTOR_STORE_DIR = TDB_DIR
VECTOR_LOCAL_DIR = TDB_LOCAL_DIR
VECTOR_API_DIR = TDB_API_DIR

# T19 图谱系统
GRAPH_ENTITY_TYPES = ["Character", "Location", "Item", "Organization", "Event", "Concept"]
GRAPH_EXTRACT_MODEL = os.getenv("GRAPH_EXTRACT_MODEL", "")  # 空=跟随 DEFAULT_MODEL
GRAPH_RECALL_WEIGHT = float(os.getenv("GRAPH_RECALL_WEIGHT", "0.3"))
GRAPH_RECALL_TOP_K = int(os.getenv("GRAPH_RECALL_TOP_K", "10"))
GRAPH_RECALL_EXPAND_DEPTH = int(os.getenv("GRAPH_RECALL_EXPAND_DEPTH", "2"))

# ── 图谱质量 Phase 2 配置 ──
GRAPH_DEDUP_ENABLED = os.getenv("GRAPH_DEDUP_ENABLED", "True").lower() in ("true", "1")
GRAPH_DEDUP_VECTOR_ENABLED = os.getenv("GRAPH_DEDUP_VECTOR_ENABLED", "True").lower() in ("true", "1")
GRAPH_DEDUP_VECTOR_TOP_K = int(os.getenv("GRAPH_DEDUP_VECTOR_TOP_K", "5"))
GRAPH_DEDUP_VECTOR_FLOOR_SCORE = float(os.getenv("GRAPH_DEDUP_VECTOR_FLOOR_SCORE", "0.3"))
GRAPH_DEDUP_LLM_ENABLED = os.getenv("GRAPH_DEDUP_LLM_ENABLED", "True").lower() in ("true", "1")
GRAPH_DEDUP_LLM_MAX_CANDIDATES = int(os.getenv("GRAPH_DEDUP_LLM_MAX_CANDIDATES", "5"))
GRAPH_CONTRADICTION_ENABLED = os.getenv("GRAPH_CONTRADICTION_ENABLED", "True").lower() in ("true", "1")
GRAPH_EXTRACT_TIMESTAMPS = os.getenv("GRAPH_EXTRACT_TIMESTAMPS", "True").lower() in ("true", "1")

# ── 图谱质量 Phase 3: 知识发现 ──
COMMUNITY_ENABLED = os.getenv("COMMUNITY_ENABLED", "True").lower() in ("true", "1")
COMMUNITY_LEIDEN_MIN_SIZE = int(os.getenv("COMMUNITY_LEIDEN_MIN_SIZE", "3"))
COMMUNITY_LEIDEN_MAX_ITER = int(os.getenv("COMMUNITY_LEIDEN_MAX_ITER", "15"))
COMMUNITY_SUMMARY_ENABLED = os.getenv("COMMUNITY_SUMMARY_ENABLED", "True").lower() in ("true", "1")
COMMUNITY_MAX_FACTS_PER_PROMPT = int(os.getenv("COMMUNITY_MAX_FACTS_PER_PROMPT", "50"))

# ── 图谱搜索增强 Phase 3 ──
GRAPH_SEARCH_EXPAND_DEPTH = int(os.getenv("GRAPH_SEARCH_EXPAND_DEPTH", "2"))
GRAPH_SEARCH_COMMUNITY_BOOST = float(os.getenv("GRAPH_SEARCH_COMMUNITY_BOOST", "0.2"))
GRAPH_SEARCH_COMMUNITY_ENABLED = os.getenv("GRAPH_SEARCH_COMMUNITY_ENABLED", "True").lower() in ("true", "1")

# ── Rerank（多服务商，全局开关/参数放 .env，服务商列表放 JSON）──
KNOWLEDGE_RERANK_ENABLED = os.getenv("KNOWLEDGE_RERANK_ENABLED", "False").lower() in ("true", "1")
KNOWLEDGE_RERANK_TOP_K = int(os.getenv("KNOWLEDGE_RERANK_TOP_K", "10"))
KNOWLEDGE_RERANK_MIN_SCORE = float(os.getenv("KNOWLEDGE_RERANK_MIN_SCORE", "0.3"))
ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY", "")

KNOWLEDGE_CHUNK_SIZE = int(os.getenv("KNOWLEDGE_CHUNK_SIZE", "300"))
KNOWLEDGE_CHUNK_OVERLAP = int(os.getenv("KNOWLEDGE_CHUNK_OVERLAP", "60"))

# PRF 伪相关反馈配置（T18 Stage 1→2 增强层）
PRF_ENABLED = os.getenv("PRF_ENABLED", "True").lower() in ("true", "1")
PRF_TOP_N = int(os.getenv("PRF_TOP_N", "5"))          # 取前 N 条结果的向量算均值
PRF_ALPHA = float(os.getenv("PRF_ALPHA", "0.7"))       # 原始查询向量权重
PRF_BETA = float(os.getenv("PRF_BETA", "0.3"))         # PRF 均值向量权重

# ── search_hybrid 双路检索（TriviumDB 原生向量+文本混合）──
SEARCH_USE_HYBRID = os.getenv("SEARCH_USE_HYBRID", "True").lower() in ("true", "1")
HYBRID_ALPHA = float(os.getenv("HYBRID_ALPHA", "0.7"))  # 向量权重，1-alpha 为文本权重

# ── search_advanced 认知管线（FISTA 残差寻隐 + DPP 多样性 + 不应期疲劳）──
SEARCH_USE_ADVANCED = os.getenv("SEARCH_USE_ADVANCED", "True").lower() in ("true", "1")
SEARCH_ADVANCED_TEXT_BOOST = float(os.getenv("SEARCH_ADVANCED_TEXT_BOOST", "1.5"))

# ── 稀疏向量（T25: doubao sparse embedding）──
SPARSE_EMBEDDING_ENABLED = os.getenv("SPARSE_EMBEDDING_ENABLED", "True").strip().lower() in ("true", "1", "yes")

# 句子级检索配置
KNOWLEDGE_SENTENCE_LEVEL = os.getenv("KNOWLEDGE_SENTENCE_LEVEL", "True").lower() in ("true", "1")
KNOWLEDGE_SENTENCE_TOP_N = int(os.getenv("KNOWLEDGE_SENTENCE_TOP_N", "5"))
KNOWLEDGE_SENTENCE_WINDOW = int(os.getenv("KNOWLEDGE_SENTENCE_WINDOW", "1"))

# Token 预算配置（知识库检索注入的 token 上限）
KNOWLEDGE_PLACEHOLDER_BUDGET = int(os.getenv("KNOWLEDGE_PLACEHOLDER_BUDGET", "800"))   # 占位符 {{}}/[[]] 共享预算
KNOWLEDGE_SEMANTIC_BUDGET = int(os.getenv("KNOWLEDGE_SEMANTIC_BUDGET", "500"))          # 语义路由自动注入预算

# 兼容旧名（逐步淘汰）
PERMISSIONS_DB_PATH = PERMISSIONS_DB

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
LOG_DIR = os.path.join(DATA_DIR, "logs")
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
