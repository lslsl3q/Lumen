"""
子代理扩展 — 注册 subagent_call 工具

支持三种模式：
- Single: 单个子代理执行
- Chain: 串行管道（{previous} 占位符）
- Parallel: 并发执行（最多 4 个）

Agent 定义从 markdown 文件发现（builtin/user/project）。
"""

import logging

logger = logging.getLogger(__name__)


def register(bus) -> None:
    """扩展入口：注册 subagent_call 工具"""
    from .tool_def import TOOL_DEFINITION, execute

    # 动态更新工具描述，包含可用 agent 列表
    _update_tool_description(TOOL_DEFINITION)

    bus.register_tool("subagent_call", TOOL_DEFINITION)

    from lumen.tool import register_handler
    register_handler("subagent_call", execute)

    logger.info("Subagent extension: registered subagent_call tool")


def unregister(bus) -> None:
    """热重载清理"""
    from lumen.tool import unregister_handler
    unregister_handler("subagent_call")

    bus.unregister_tool("subagent_call")

    logger.info("Subagent extension: unregistered subagent_call tool")


def _update_tool_description(tool_def: dict) -> None:
    """根据发现的 agent 动态更新工具描述中的 agent 列表"""
    try:
        from .agent_config import discover_agents
        agents = discover_agents("all")
        if agents:
            agent_list = ", ".join(
                f"{a.name}({a.description})" if a.description else a.name
                for a in agents
            )
            # 在现有描述末尾追加动态 agent 列表
            original = tool_def["description"]
            tool_def["description"] = (
                f"{original}\n"
                f"已发现 agent: {agent_list}"
            )
    except Exception as e:
        logger.debug(f"Failed to update tool description: {e}")
