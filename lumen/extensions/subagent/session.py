"""
子代理会话管理 — 保存每次运行的历史记录

每个子代理运行保存为独立的 JSONL 文件，格式：
- 每行一个 JSON 对象
- type: "start" | "message" | "tool_call" | "tool_result" | "end"
- 包含时间戳、agent、task、输出等

存储位置：~/.lumen/subagent_sessions/{run_id}.jsonl
"""

import json
import logging
import os
import time
from typing import Any
from datetime import datetime

logger = logging.getLogger(__name__)

_SESSIONS_DIR = os.path.expanduser("~/.lumen/subagent_sessions")
_SAFE_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")


def _safe_id(run_id: str) -> str:
    """清理 run_id，只保留安全字符，防止路径穿越"""
    return "".join(c for c in run_id if c in _SAFE_ID_CHARS)


def _ensure_dir():
    os.makedirs(_SESSIONS_DIR, exist_ok=True)


def create_session(run_id: str, agent: str, task: str, mode: str = "single") -> str:
    """创建新会话，返回文件路径"""
    _ensure_dir()
    filepath = os.path.join(_SESSIONS_DIR, f"{_safe_id(run_id)}.jsonl")

    entry = {
        "type": "start",
        "run_id": run_id,
        "agent": agent,
        "task": task,
        "mode": mode,
        "timestamp": datetime.now().isoformat(),
        "epoch": time.time(),
    }

    with open(filepath, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return filepath


def log_message(filepath: str, role: str, content: str) -> None:
    """记录一条消息"""
    entry = {
        "type": "message",
        "role": role,
        "content": content[:2000],  # 截断过长内容
        "timestamp": datetime.now().isoformat(),
    }
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def log_tool_call(filepath: str, tool_name: str, params: dict, result: dict) -> None:
    """记录一次工具调用"""
    entry = {
        "type": "tool_call",
        "tool": tool_name,
        "params": params,
        "success": result.get("success", False),
        "result_preview": json.dumps(result, ensure_ascii=False)[:500],
        "timestamp": datetime.now().isoformat(),
    }
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def end_session(filepath: str, output: str, tool_calls: int, iterations: int, success: bool = True) -> None:
    """结束会话"""
    entry = {
        "type": "end",
        "output": output[:5000],  # 截断过长输出
        "tool_calls": tool_calls,
        "iterations": iterations,
        "success": success,
        "timestamp": datetime.now().isoformat(),
    }
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_session(filepath: str) -> list[dict[str, Any]]:
    """读取会话历史"""
    entries = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    except (IOError, json.JSONDecodeError):
        pass
    return entries


def list_sessions(limit: int = 20) -> list[dict[str, Any]]:
    """列出最近的会话"""
    _ensure_dir()
    sessions = []

    for filename in sorted(os.listdir(_SESSIONS_DIR), reverse=True):
        if not filename.endswith(".jsonl"):
            continue
        filepath = os.path.join(_SESSIONS_DIR, filename)
        entries = read_session(filepath)
        if not entries:
            continue

        start = entries[0]
        end = entries[-1] if entries[-1].get("type") == "end" else None

        sessions.append({
            "run_id": start.get("run_id", filename.replace(".jsonl", "")),
            "agent": start.get("agent", ""),
            "task": start.get("task", "")[:100],
            "mode": start.get("mode", "single"),
            "timestamp": start.get("timestamp", ""),
            "success": end.get("success") if end else None,
            "tool_calls": end.get("tool_calls", 0) if end else 0,
            "filepath": filepath,
        })

        if len(sessions) >= limit:
            break

    return sessions


def get_session_summary(run_id: str) -> dict[str, Any] | None:
    """获取会话摘要"""
    filepath = os.path.join(_SESSIONS_DIR, f"{_safe_id(run_id)}.jsonl")
    if not os.path.exists(filepath):
        return None

    entries = read_session(filepath)
    if not entries:
        return None

    start = entries[0]
    end = entries[-1] if entries[-1].get("type") == "end" else None
    tool_calls = [e for e in entries if e.get("type") == "tool_call"]

    return {
        "run_id": start.get("run_id", ""),
        "agent": start.get("agent", ""),
        "task": start.get("task", ""),
        "mode": start.get("mode", "single"),
        "timestamp": start.get("timestamp", ""),
        "success": end.get("success") if end else None,
        "output": end.get("output", "") if end else "",
        "tool_calls_count": len(tool_calls),
        "iterations": end.get("iterations", 0) if end else 0,
        "total_messages": len([e for e in entries if e.get("type") == "message"]),
    }


def load_messages_for_resume(run_id: str) -> dict[str, Any] | None:
    """加载会话消息用于恢复

    Returns:
        {"agent": str, "task": str, "messages": list[dict], "last_output": str} or None
    """
    filepath = os.path.join(_SESSIONS_DIR, f"{_safe_id(run_id)}.jsonl")
    if not os.path.exists(filepath):
        return None

    entries = read_session(filepath)
    if not entries:
        return None

    start = entries[0]
    messages = []
    last_output = ""

    for entry in entries:
        if entry.get("type") == "message":
            messages.append({
                "role": entry.get("role", "user"),
                "content": entry.get("content", ""),
            })
        elif entry.get("type") == "tool_call":
            # 重建工具调用的消息序列
            tool_name = entry.get("tool", "")
            params = entry.get("params", {})
            result_preview = entry.get("result_preview", "")
            messages.append({
                "role": "assistant",
                "content": json.dumps({"tool": tool_name, "params": params}, ensure_ascii=False),
            })
            messages.append({
                "role": "user",
                "content": f"工具 {tool_name} 的结果：\n{result_preview}",
            })
        elif entry.get("type") == "end":
            last_output = entry.get("output", "")

    return {
        "agent": start.get("agent", "worker"),
        "task": start.get("task", ""),
        "messages": messages,
        "last_output": last_output,
    }
