"""
Lumen - 模板变量系统
在发给大模型的文本中，用 {{变量名}} 引用动态内容
替换发生在 core/chat.py 发送消息之前，全局生效

变量分两类：
  系统变量 — 代码内置，自动收集，用户不能改名字和获取逻辑
  自定义变量 — 用户通过配置 API 创建，可以自由增删改
"""

import re
import platform
import logging
from datetime import datetime
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# 匹配 {{变量名}} 的正则
_VARIABLE_PATTERN = re.compile(r'\{\{(\w+)\}\}')


# ========================================
# 系统变量（内置，自动收集）
# ========================================

def _collect_system_variables(character_id: str = "default") -> Dict[str, str]:
    """收集系统内置变量

    这些变量由代码自动生成，用户不能修改名称和获取逻辑
    新增系统变量在这里添加即可，自动全局生效

    Args:
        character_id: 当前角色ID，用于加载对应的记忆上下文
    """
    variables = {}

    # --- 时间（用 {{date_time}} 引用完整时间，也可单独引用 {{current_date}} 等）---
    now = datetime.now()
    weekdays = ["一", "二", "三", "四", "五", "六", "日"]
    variables["current_date"] = now.strftime('%Y年%m月%d日')
    variables["current_time"] = now.strftime('%H:%M:%S')
    variables["current_weekday"] = f"星期{weekdays[now.weekday()]}"
    # 完整时间（集合，直接用 {{date_time}} 即可）
    variables["date_time"] = (
        f"{now.strftime('%Y年%m月%d日')} {now.strftime('%H:%M:%S')}，"
        f"星期{weekdays[now.weekday()]}"
    )

    # --- 系统环境 ---
    variables["os_name"] = platform.system()           # Windows / Linux / Darwin
    variables["os_version"] = platform.version()        # 10.0.26200 等
    variables["os_release"] = platform.release()        # 10 / 11 等
    variables["python_version"] = platform.python_version()
    variables["machine"] = platform.machine()           # AMD64 / x86_64
    variables["processor"] = platform.processor()       # 处理器型号

    # 拼一个完整的系统信息（方便角色卡直接用 {{system_info}}）
    variables["system_info"] = (
        f"操作系统: {variables['os_name']} {variables['os_release']} "
        f"({variables['os_version']})\n"
        f"架构: {variables['machine']}\n"
        f"处理器: {variables['processor']}"
    )

    # --- 记忆上下文（延迟导入避免循环依赖）---
    try:
        from lumen.services.memory import get_memory_context
        memory_text = get_memory_context(character_id)
        if memory_text:
            variables["memory"] = memory_text
    except Exception as e:
        logger.warning("获取记忆上下文失败(%s): %s: %s", character_id, type(e).__name__, e)

    return variables


# ========================================
# 自定义变量（用户通过配置 API 管理）
# ========================================

def _collect_custom_variables() -> Dict[str, str]:
    """收集用户自定义变量

    从配置文件加载用户自己定义的变量
    未来实现：从 config API 或 JSON 文件读取
    """
    # RESERVED: 从配置存储加载用户自定义模板变量
    return {}


# ========================================
# 统一接口
# ========================================

def collect_variables(character_id: str = "default") -> Dict[str, str]:
    """收集所有模板变量（系统 + 自定义）

    自定义变量优先级高于系统变量（同名时自定义覆盖系统）

    Args:
        character_id: 当前角色ID，用于加载对应的记忆上下文
    """
    variables = {}
    variables.update(_collect_system_variables(character_id))
    variables.update(_collect_custom_variables())  # 自定义覆盖同名系统变量
    return variables


def render_template(text: str, variables: Dict[str, str]) -> str:
    """替换文本中的 {{变量名}} 占位符

    Args:
        text: 原始文本，可能包含 {{xxx}} 占位符
        variables: 变量字典，{"xxx": "实际值"}

    Returns:
        替换后的文本。未找到的变量保持原样（不删除）
    """
    def _replace(match):
        var_name = match.group(1)
        if var_name in variables:
            value = variables[var_name]
            return str(value) if value is not None else ""
        return match.group(0)  # 未找到的变量保持原样

    return _VARIABLE_PATTERN.sub(_replace, text)


def render_messages(messages: List[Dict[str, Any]], variables: Dict[str, str]) -> List[Dict[str, Any]]:
    """对所有消息的 content 做模板替换

    Args:
        messages: 消息列表
        variables: 变量字典

    Returns:
        替换后的消息列表（新列表，不修改原消息）
    """
    rendered = []
    for msg in messages:
        rendered.append({
            **msg,
            "content": render_template(msg["content"], variables),
        })
    return rendered
