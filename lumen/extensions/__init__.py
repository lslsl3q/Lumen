"""
扩展系统 — 自动发现 + 加载 + 热重载

扫描 extensions/ 目录，发现并注册所有扩展。
扩展可以是：
  1. 单个 .py 文件，包含 register(hook_bus) 函数
  2. 子目录，__init__.py 中包含 register(hook_bus) 函数

扩展通过 HookBus 注册事件钩子和工具。
依赖方向：extensions → services/tools/types（向下），扩展之间不互相依赖。

热重载：reload_extensions() 只影响 extensions/ 模块，不影响核心组件（PlotEngine 等）。
所有扩展注册的 handler 统一用 ext.* 前缀命名，方便兜底清理。
"""

import asyncio
import importlib
import logging
import pkgutil
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# 已加载的扩展模块（防重复加载）
_loaded: set[str] = set()

# 热重载锁（防并发重载）
_reload_lock = asyncio.Lock()


def discover_and_register() -> list[str]:
    """扫描 extensions/ 目录，发现并注册所有扩展。

    Returns:
        已加载的扩展名称列表
    """
    from lumen.core.hook_bus import HookBus

    bus = HookBus.get()
    extensions_dir = Path(__file__).parent
    loaded_names: list[str] = []

    # 扫描当前包下的所有子模块和子包
    for importer, modname, ispkg in pkgutil.iter_modules([str(extensions_dir)]):
        if modname.startswith("_"):
            continue  # 跳过 __init__.py 和 _private 模块

        full_name = f"lumen.extensions.{modname}"
        if full_name in _loaded:
            continue

        try:
            module = importlib.import_module(full_name)
            _loaded.add(full_name)

            # 查找 register(hook_bus) 函数
            if hasattr(module, "register") and callable(module.register):
                module.register(bus)
                loaded_names.append(modname)
                logger.info(f"Extension loaded: {modname}")
            else:
                logger.debug(f"Extension {modname}: no register() function found, skipped")

        except Exception as e:
            logger.error(f"Extension {modname} failed to load: {e}")

    return loaded_names


async def reload_extensions() -> dict:
    """热重载所有扩展（仅影响 extensions/ 模块，不影响核心组件）

    清理顺序：
    1. 调用每个扩展的 unregister(bus) — 让扩展清理自己注册的 hooks + tools
    2. 兜底：清理所有 ext.* 前缀的 HookBus handler（防止扩展忘记清理）
    3. 清理 HookBus._registered_tools 中扩展注册的工具
    4. 从 sys.modules 删除旧模块
    5. 重新调用 discover_and_register()

    使用 asyncio.Lock 防止并发重载。

    Returns:
        {"unloaded": int, "loaded": list[str]}
    """
    async with _reload_lock:
        from lumen.core.hook_bus import HookBus

        bus = HookBus.get()
        unloaded = []

        # 1. 逐个调用 unregister(bus) 清理
        for full_name in list(_loaded):
            try:
                module = sys.modules.get(full_name)
                if module and hasattr(module, "unregister"):
                    module.unregister(bus)
            except Exception as e:
                logger.warning(f"Extension {full_name} unregister failed: {e}")

            # 2. 从 sys.modules 删除（含子包子模块）
            sys.modules.pop(full_name, None)
            prefix = full_name + "."
            for mod_name in list(sys.modules.keys()):
                if mod_name.startswith(prefix):
                    sys.modules.pop(mod_name, None)
            unloaded.append(full_name)

        # 3. 兜底：清理所有 ext.* 前缀的 HookBus handler
        for event_name in list(bus._handlers.keys()):
            bus._handlers[event_name] = [
                h for h in bus._handlers[event_name]
                if not h.name.startswith("ext.")
            ]
        # 清理空的 handler 列表
        bus._handlers = {k: v for k, v in bus._handlers.items() if v}

        # 4. 清理 HookBus 中扩展注册的工具 + ToolRegistry
        for tool_name in list(bus._registered_tools.keys()):
            bus.unregister_tool(tool_name)

        _loaded.clear()

        # 5. 重新加载
        loaded_names = discover_and_register()
        logger.info(f"Extensions reloaded: {len(unloaded)} unloaded, {len(loaded_names)} loaded")
        return {"unloaded": len(unloaded), "loaded": loaded_names}
