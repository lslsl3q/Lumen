"""
Agent 发现与配置

从 markdown 文件加载 Agent 定义（YAML frontmatter + system prompt）。
支持用户级（~/.lumen/agents/）和项目级（.lumen/agents/）两种位置。

Agent 文件格式：
    ---
    name: scout
    description: 快速侦察代码库
    model: haiku
    tools: web_search, file_manager
    max_depth: 1
    ---
    你的系统提示词...
"""

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

# 缓存：避免每次 get_agent() 都扫描文件系统
_agents_cache: list[AgentConfig] | None = None

# Agent 搜索路径
_USER_AGENTS_DIR = os.path.expanduser("~/.lumen/agents")
_PROJECT_AGENTS_DIR = ".lumen/agents"
_BUILTIN_AGENTS_DIR = os.path.join(os.path.dirname(__file__), "agents")


@dataclass
class AgentConfig:
    """Agent 配置"""
    name: str
    description: str = ""
    model: str = ""  # 空 = 用默认模型
    tools: list[str] = field(default_factory=list)
    system_prompt: str = ""
    max_depth: int = 1
    source: str = "builtin"  # builtin | user | project
    thinking: str = ""       # high/medium/low/空(不启用)
    system_prompt_mode: str = "replace"  # replace(覆盖) / append(追加到默认)
    default_reads: list[str] = field(default_factory=list)  # 启动时自动读取的文件
    max_iterations: int = 8  # 工具调用循环最大轮次


def _parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """解析 YAML frontmatter + body"""
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}

    body = parts[2].strip()
    return meta, body


def _load_agent_file(filepath: str, source: str) -> AgentConfig | None:
    """从单个 markdown 文件加载 Agent 配置"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except IOError:
        return None

    meta, body = _parse_frontmatter(content)
    name = meta.get("name", "")
    if not name:
        name = Path(filepath).stem

    tools_raw = meta.get("tools", "")
    if isinstance(tools_raw, str):
        tools = [t.strip() for t in tools_raw.split(",") if t.strip()]
    elif isinstance(tools_raw, list):
        tools = [str(t) for t in tools_raw]
    else:
        tools = []

    # 解析 thinking
    thinking_raw = meta.get("thinking", "")
    thinking = str(thinking_raw).lower() if thinking_raw else ""

    # 解析 systemPromptMode
    prompt_mode = str(meta.get("systemPromptMode", "replace")).lower()

    # 解析 defaultReads
    reads_raw = meta.get("defaultReads", "")
    if isinstance(reads_raw, str):
        default_reads = [r.strip() for r in reads_raw.split(",") if r.strip()]
    elif isinstance(reads_raw, list):
        default_reads = [str(r) for r in reads_raw]
    else:
        default_reads = []

    return AgentConfig(
        name=name,
        description=meta.get("description", ""),
        model=meta.get("model", ""),
        tools=tools,
        system_prompt=body,
        max_depth=int(meta.get("max_depth", 1)),
        source=source,
        thinking=thinking,
        system_prompt_mode=prompt_mode,
        default_reads=default_reads,
        max_iterations=int(meta.get("max_iterations", meta.get("maxIterations", 8))),
    )


def _scan_dir(directory: str, source: str) -> list[AgentConfig]:
    """扫描目录中的 .md 文件"""
    agents = []
    if not os.path.isdir(directory):
        return agents

    for filename in sorted(os.listdir(directory)):
        if not filename.endswith(".md"):
            continue
        filepath = os.path.join(directory, filename)
        agent = _load_agent_file(filepath, source)
        if agent:
            agents.append(agent)

    return agents


def discover_agents(scope: str = "all") -> list[AgentConfig]:
    """发现所有可用 Agent

    Args:
        scope: "builtin" | "user" | "project" | "all"

    Returns:
        Agent 配置列表（按 scope 优先级去重：project > user > builtin）
    """
    global _agents_cache
    if _agents_cache is not None:
        if scope == "all":
            return _agents_cache
        return [a for a in _agents_cache if a.source == scope]

    agents: dict[str, AgentConfig] = {}

    # Builtin（最低优先级）
    for agent in _scan_dir(_BUILTIN_AGENTS_DIR, "builtin"):
        agents[agent.name] = agent

    # User
    for agent in _scan_dir(_USER_AGENTS_DIR, "user"):
        agents[agent.name] = agent

    # Project（最高优先级）
    for agent in _scan_dir(_PROJECT_AGENTS_DIR, "project"):
        agents[agent.name] = agent

    _agents_cache = list(agents.values())
    return _agents_cache


def get_agent(name: str) -> AgentConfig | None:
    """按名称获取 Agent 配置"""
    agents = discover_agents("all")
    return next((a for a in agents if a.name == name), None)


def list_agents_summary() -> list[dict[str, str]]:
    """返回 Agent 摘要列表（供 LLM 选择）"""
    agents = discover_agents("all")
    return [
        {
            "name": a.name,
            "description": a.description,
            "source": a.source,
            "model": a.model or "default",
            "tools": ", ".join(a.tools) if a.tools else "all",
        }
        for a in agents
    ]
