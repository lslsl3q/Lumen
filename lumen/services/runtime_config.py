"""
Lumen - 运行时配置
持久化到 data/runtime_config.json，启动时读取，运行时修改立即写盘。
用于前端可动态修改的配置项（缓冲区开关、自动清理等）。
"""

import json
import os
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_CONFIG_PATH = os.path.join(_DATA_DIR, "runtime_config.json")

_lock = threading.Lock()
_cache: dict | None = None

_DEFAULTS = {
    "buffer_enabled": False,
    "buffer_auto_cleanup": False,
    "buffer_auto_consolidate_threshold": 20,
    "buffer_consolidation_model": "",
}


def _load() -> dict:
    """从磁盘读取配置（带缓存）"""
    global _cache
    if _cache is not None:
        return _cache

    config = dict(_DEFAULTS)
    if os.path.exists(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            config.update(saved)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"运行时配置读取失败，用默认值: {e}")

    _cache = config
    return _cache


def _save(config: dict) -> None:
    """立即写盘"""
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get(key: str, default: Any = None) -> Any:
    """获取配置值"""
    with _lock:
        config = _load()
    return config.get(key, default)


def set(key: str, value: Any) -> None:
    """设置配置值（立即持久化）"""
    with _lock:
        config = _load()
        config[key] = value
        _save(config)
    logger.info(f"运行时配置更新: {key} = {value}")


def get_all() -> dict:
    """获取全部配置"""
    with _lock:
        return dict(_load())


def update_many(updates: dict) -> None:
    """批量更新（一次写盘）"""
    with _lock:
        config = _load()
        config.update(updates)
        _save(config)
    logger.info(f"运行时配置批量更新: {list(updates.keys())}")


def reset_cache() -> None:
    """清除缓存（测试用）"""
    global _cache
    _cache = None
