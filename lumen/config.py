"""
Lumen - 统一配置管理
所有配置项集中在这里，方便动态调整
"""

import os
from dotenv import load_dotenv
from openai import OpenAI

# 加载环境变量
load_dotenv()

# API 客户端（全局单例）
client = OpenAI(
    base_url=os.getenv("API_URL"),
    api_key=os.getenv("API_KEY"),
)

# 默认模型（可以通过环境变量覆盖）
DEFAULT_MODEL = os.getenv("MODEL", "gemini-2.5-flash")


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
