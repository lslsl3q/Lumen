"""
HookBus — 统一事件调度中心

全局单例，负责 handler 注册、按 priority 分发、YAML 规则加载。
现有 Component/MessageBus/EventProcessor 不修改，后续作为 handler 挂载。
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Callable, Optional

from lumen.core.hook_types import HookEvent

logger = logging.getLogger(__name__)


class HookStopPropagation(Exception):
    """Handler 抛出此异常可阻断后续 handler 执行"""
    pass


class _HandlerEntry:
    __slots__ = ("callback", "priority", "name")

    def __init__(self, callback: Callable, priority: int, name: str):
        self.callback = callback
        self.priority = priority
        self.name = name


class HookBus:
    """全局单例 — 事件注册、匹配、分发"""

    _instance: Optional["HookBus"] = None

    @classmethod
    def get(cls) -> "HookBus":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """测试用：重置单例"""
        cls._instance = None

    def __init__(self):
        self._handlers: dict[str, list[_HandlerEntry]] = {}
        self._loaded_configs: set[str] = set()
        self._registered_tools: dict[str, dict] = {}

    def register_tool(self, name: str, definition: dict) -> bool:
        """注册工具到 ToolRegistry（桥接扩展系统和工具系统）。

        扩展调用此方法注册工具，工具同时进入 ToolRegistry（供 character.tools 过滤）
        和 HookBus 内部缓存（供扩展查询已注册工具）。

        Args:
            name: 工具名称
            definition: 工具定义（需符合 registry.json 格式）

        Returns:
            是否注册成功
        """
        from lumen.tools.registry import get_registry, validate_tool_definition

        is_valid, error = validate_tool_definition(name, definition)
        if not is_valid:
            logger.error(f"HookBus: tool '{name}' validation failed: {error}")
            return False

        registry = get_registry()
        registry.tools[name] = definition
        self._registered_tools[name] = definition
        logger.info(f"HookBus: registered tool '{name}'")
        return True

    def get_registered_tools(self) -> dict[str, dict]:
        """获取通过 HookBus 注册的所有工具"""
        return self._registered_tools.copy()

    def unregister_tool(self, name: str) -> bool:
        """注销通过 HookBus 注册的工具（同时清理 ToolRegistry）

        Args:
            name: 工具名称

        Returns:
            是否成功注销
        """
        removed = False
        if name in self._registered_tools:
            del self._registered_tools[name]
            removed = True
        try:
            from lumen.tools.registry import get_registry
            registry = get_registry()
            if name in registry.tools:
                del registry.tools[name]
                removed = True
        except Exception:
            pass
        if removed:
            logger.info(f"HookBus: unregistered tool '{name}'")
        return removed

    def register(
        self,
        event: str,
        handler: Callable,
        priority: int = 50,
        name: str = "",
    ) -> None:
        """注册 handler，priority 越小越先执行"""
        if event not in self._handlers:
            self._handlers[event] = []
        entry = _HandlerEntry(
            callback=handler,
            priority=priority,
            name=name or handler.__name__,
        )
        self._handlers[event].append(entry)
        self._handlers[event].sort(key=lambda h: h.priority)
        logger.debug(f"HookBus: registered {entry.name} for '{event}' (priority={priority})")

    def unregister(self, event: str, name: str) -> None:
        """按 name 取消注册"""
        if event in self._handlers:
            self._handlers[event] = [
                h for h in self._handlers[event] if h.name != name
            ]

    async def emit(self, event: str, payload: HookEvent) -> None:
        """按 priority 顺序执行所有匹配 handler。

        同 priority 的 handler 并发执行（TaskGroup）。
        不同 priority 组之间串行，支持 HookStopPropagation 阻断。
        """
        if event not in self._handlers:
            return

        payload.timestamp = time.time()

        # 按 priority 分组
        groups: dict[int, list[_HandlerEntry]] = {}
        for h in self._handlers[event]:
            groups.setdefault(h.priority, []).append(h)

        for priority in sorted(groups.keys()):
            entries = groups[priority]
            if len(entries) == 1:
                try:
                    await entries[0].callback(payload)
                except HookStopPropagation:
                    logger.info(f"HookBus: {entries[0].name} stopped propagation for '{event}'")
                    return
                except Exception:
                    logger.exception(f"HookBus: {entries[0].name} failed for '{event}'")
            else:
                # 同 priority 并发执行，except* 统一处理异常组
                stopped = False
                try:
                    async with asyncio.TaskGroup() as tg:
                        for entry in entries:
                            tg.create_task(entry.callback(payload))
                except* HookStopPropagation:
                    logger.info(f"HookBus: handler stopped propagation for '{event}'")
                    stopped = True
                except* Exception as eg:
                    for exc in eg.exceptions:
                        logger.exception(f"HookBus: handler failed for '{event}': {exc}")
                if stopped:
                    return

    def from_config(self, path: Path) -> None:
        """从 YAML 文件加载规则，注册为 handler"""
        import yaml

        path = Path(path)
        if not path.exists():
            logger.warning(f"HookBus: config not found: {path}")
            return

        key = str(path.resolve())
        if key in self._loaded_configs:
            return
        self._loaded_configs.add(key)

        with open(path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        for rule in config.get("rules", []):
            if not rule or "event" not in rule:
                continue
            event = rule["event"]
            condition = rule.get("when", "")
            action_name = rule.get("do", "")
            priority = rule.get("priority", 50)

            handler = _make_yaml_handler(action_name, condition)
            self.register(event, handler, priority=priority, name=f"yaml:{action_name}")


def _make_yaml_handler(action_name: str, condition: str) -> Callable:
    """为 YAML 规则创建 handler wrapper

    RESERVED: YAML handler 当前只做条件匹配 + 日志记录。
    实际动作（注入提示词、修改状态等）将在 T28 由 Python handler 替代。
    """
    async def _handler(payload: HookEvent) -> None:
        if condition:
            from simpleeval import simple_eval
            ctx = {"payload": payload}
            try:
                if not simple_eval(condition, names=ctx):
                    return
            except Exception:
                logger.warning(f"HookBus: condition eval failed: {condition}")
                return
        logger.info(f"HookBus: YAML rule '{action_name}' triggered")
    return _handler
