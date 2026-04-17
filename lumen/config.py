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

# LLM API 超时时间（秒）
# 可以通过环境变量 LLM_TIMEOUT 覆盖
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

# ReAct 循环最大轮次（防止 AI 无限调用工具）
# 可以通过环境变量 MAX_TOOL_ITERATIONS 覆盖
MAX_TOOL_ITERATIONS = int(os.getenv("MAX_TOOL_ITERATIONS", "10"))

# WebSocket 推送通道设置
# 心跳间隔（秒），保持连接存活（应对休眠唤醒）
WS_HEARTBEAT_INTERVAL = float(os.getenv("WS_HEARTBEAT_INTERVAL", "30"))


def get_model(character_config: dict = None) -> str:
    """获取当前应该使用的模型

    Args:
        character_config: 角色配置字典（可选）
                         如果角色配置里有 model 字段，就用角色的

    Returns:
        模型名称字符串
    """
    if character_config and "model" in character_config:
        return character_config["model"]
    return DEFAULT_MODEL
