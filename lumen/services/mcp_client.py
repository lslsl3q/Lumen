"""
Lumen - MCP 客户端服务

连接外部 MCP 服务器，发现工具，调用工具
架构位置：services/（基础设施层，不直接暴露给 AI）
"""
import asyncio
import json
import logging
import os
import threading
from typing import Any

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

logger = logging.getLogger(__name__)

MCP_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "mcp_servers.json"
)

# 缓存：{server_name: {"tools": [...], "config": {...}}}
_discovered: dict[str, dict] = {}

# 持久事件循环线程（复用，避免每次调用都 asyncio.run）
_loop: asyncio.AbstractEventLoop | None = None
_loop_thread: threading.Thread | None = None
_loop_ready = threading.Event()


def _ensure_loop():
    """确保后台事件循环线程已启动"""
    global _loop, _loop_thread
    if _loop is not None and _loop.is_running():
        return

    def _run_loop():
        global _loop
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
        _loop_ready.set()
        _loop.run_forever()

    _loop_ready.clear()
    _loop_thread = threading.Thread(target=_run_loop, daemon=True, name="mcp-loop")
    _loop_thread.start()
    _loop_ready.wait(timeout=5)


def _run_async(coro):
    """在持久事件循环中运行异步协程并等待结果"""
    _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    return future.result(timeout=60)


def load_mcp_config() -> list[dict]:
    """加载 MCP 服务器配置"""
    if not os.path.exists(MCP_CONFIG_PATH):
        return []
    with open(MCP_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


async def discover_tools_from_server(server_config: dict) -> list[dict]:
    """连接 MCP 服务器，发现可用工具，返回工具定义列表"""
    name = server_config.get("name", "unknown")
    command = server_config.get("command", "")
    args = server_config.get("args", [])
    env = server_config.get("env")

    if not command:
        logger.warning("MCP 服务器 %s 缺少 command", name)
        return []

    server_params = StdioServerParameters(
        command=command,
        args=args,
        env=env,
    )

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()

                tools = []
                for tool in result.tools:
                    tools.append({
                        "name": f"mcp__{name}__{tool.name}",
                        "original_name": tool.name,
                        "server": name,
                        "description": tool.description or "",
                        "parameters": _mcp_schema_to_lumen(tool.inputSchema) if tool.inputSchema else {"type": "object", "properties": {}},
                    })

                logger.info("MCP 服务器 %s: 发现 %d 个工具", name, len(tools))
                return tools
    except Exception as e:
        logger.error("连接 MCP 服务器 %s 失败: %s", name, e)
        return []


async def call_mcp_tool(server_name: str, tool_name: str, arguments: dict) -> Any:
    """调用 MCP 工具，返回结果"""
    config = _get_server_config(server_name)
    if not config:
        raise RuntimeError(f"MCP 服务器 {server_name} 未配置")

    command = config.get("command", "")
    args = config.get("args", [])
    env = config.get("env")

    server_params = StdioServerParameters(command=command, args=args, env=env)

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments=arguments)

            # 提取文本内容
            if result.content:
                texts = []
                for block in result.content:
                    if hasattr(block, "text"):
                        texts.append(block.text)
                return "\n".join(texts) if texts else str(result.content)

            return ""


def execute_mcp_tool_sync(tool_name: str, params: dict) -> dict:
    """同步包装器：供 tools/base.py 的 execute_tool 调用

    解析工具名格式 mcp__{server}__{tool}，调用对应 MCP 服务器
    使用持久事件循环线程，避免每次调用都创建新的事件循环
    """
    from lumen.tools.types import ErrorCode
    from lumen.tool import success_result, error_result

    parts = tool_name.split("__", 2)
    if len(parts) != 3 or parts[0] != "mcp":
        return error_result(tool_name, ErrorCode.TOOL_UNKNOWN, f"无效的 MCP 工具名: {tool_name}")

    server_name = parts[1]
    original_name = parts[2]

    try:
        result = _run_async(call_mcp_tool(server_name, original_name, params))
        return success_result(tool_name, str(result))
    except Exception as e:
        return error_result(tool_name, ErrorCode.EXEC_FAILED, f"MCP 工具调用失败: {e}")


async def discover_all_tools() -> dict[str, dict]:
    """发现所有 MCP 服务器的工具，返回 {prefixed_name: tool_def}"""
    configs = load_mcp_config()
    all_tools = {}

    for config in configs:
        name = config.get("name", "unknown")
        tools = await discover_tools_from_server(config)
        _discovered[name] = {"tools": tools, "config": config}

        for tool in tools:
            all_tools[tool["name"]] = tool

    return all_tools


def get_discovered_tools() -> dict[str, dict]:
    """获取已发现的工具"""
    result = {}
    for server_data in _discovered.values():
        for tool in server_data["tools"]:
            result[tool["name"]] = tool
    return result


def _get_server_config(server_name: str) -> dict | None:
    configs = load_mcp_config()
    for c in configs:
        if c.get("name") == server_name:
            return c
    return None


def _mcp_schema_to_lumen(schema: dict) -> dict:
    """将 MCP inputSchema 转换为 Lumen 的参数格式"""
    if not schema:
        return {"type": "object", "properties": {}}
    # MCP inputSchema 本身就是 JSON Schema，直接兼容
    return schema
