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
        "API_KEY": "API 密钥"
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


# 默认模型（可以通过环境变量覆盖）
DEFAULT_MODEL = os.getenv("MODEL", "glm-5.1")

# 摘要模型（用于 compact 压缩、记忆摘要等，可以和聊天模型不同）
# 留空则跟随角色/默认模型
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "")

# LLM API 超时时间（秒）
# 可以通过环境变量 LLM_TIMEOUT 覆盖
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

# ReAct 循环最大轮次（防止 AI 无限调用工具）
# 可以通过环境变量 MAX_TOOL_ITERATIONS 覆盖
MAX_TOOL_ITERATIONS = int(os.getenv("MAX_TOOL_ITERATIONS", "10"))

# 默认上下文窗口大小（tokens），角色级 context_size 未设置时使用
DEFAULT_CONTEXT_SIZE = int(os.getenv("DEFAULT_CONTEXT_SIZE", "8192"))

# WebSocket 推送通道设置
# 心跳间隔（秒），保持连接存活（应对休眠唤醒）
WS_HEARTBEAT_INTERVAL = float(os.getenv("WS_HEARTBEAT_INTERVAL", "30"))

# 嵌入模型配置（语义搜索）
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "thenlper/gte-small-zh")
EMBEDDING_ENABLED = os.getenv("EMBEDDING_ENABLED", "True").lower() in ("true", "1", "yes")
EMBEDDING_DIMENSIONS = 512  # gte-small-zh 固定输出维度

# 知识库配置
KNOWLEDGE_DB_PATH = os.getenv(
    "KNOWLEDGE_DB_PATH",
    os.path.join(os.path.dirname(__file__), "data", "knowledge.tdb"),
)
KNOWLEDGE_SOURCE_DIR = os.getenv(
    "KNOWLEDGE_SOURCE_DIR",
    os.path.join(os.path.dirname(__file__), "data", "knowledge"),
)
KNOWLEDGE_CHUNK_SIZE = int(os.getenv("KNOWLEDGE_CHUNK_SIZE", "300"))
KNOWLEDGE_CHUNK_OVERLAP = int(os.getenv("KNOWLEDGE_CHUNK_OVERLAP", "60"))


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
