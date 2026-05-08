"""
Lumen - 世界书数据管理

文件存储 + 内存缓存 + CRUD 操作
参考 Persona 系统模式
"""
import json
import os
import re
import logging
from typing import List, Dict, Optional
from lumen.types.worldbook import WorldBookEntry, WorldBookCreateRequest, WorldBookUpdateRequest

logger = logging.getLogger(__name__)

# 世界书条目文件夹
WORLDBOOKS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "worldbooks")

# 模块级缓存
_cached_entries: Optional[List[Dict]] = None


def _validate_entry_id(entry_id: str) -> str:
    """校验条目ID合法性（字母数字下划线连字符）"""
    if not re.match(r'^[a-zA-Z0-9_\-]+$', entry_id):
        raise ValueError(f"非法的世界书条目ID: {entry_id}")
    return entry_id


def list_worldbooks() -> List[Dict]:
    """列出所有世界书条目"""
    global _cached_entries
    if _cached_entries is not None:
        return _cached_entries

    entries = []
    if not os.path.exists(WORLDBOOKS_DIR):
        return entries

    for filename in os.listdir(WORLDBOOKS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(WORLDBOOKS_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                entry = WorldBookEntry.model_validate(raw)
                entries.append(entry.model_dump())
            except Exception as e:
                logger.warning("跳过损坏的世界书文件 %s: %s", filename, e)
                continue

    _cached_entries = entries
    return entries


def load_worldbook(entry_id: str) -> Dict:
    """加载单个世界书条目"""
    _validate_entry_id(entry_id)
    filepath = os.path.join(WORLDBOOKS_DIR, f"{entry_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"世界书条目不存在: {entry_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    entry = WorldBookEntry.model_validate(raw)
    return entry.model_dump()


def create_worldbook(entry_id: str, data: Dict) -> Dict:
    """创建世界书条目"""
    _validate_entry_id(entry_id)
    os.makedirs(WORLDBOOKS_DIR, exist_ok=True)
    filepath = os.path.join(WORLDBOOKS_DIR, f"{entry_id}.json")
    if os.path.exists(filepath):
        raise FileExistsError(f"世界书条目已存在: {entry_id}")

    # 确保 ID 字段被正确设置
    data["id"] = entry_id
    entry = WorldBookEntry.model_validate(data)
    raw = entry.model_dump()

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    _clear_cache()
    logger.info("创建世界书条目: %s", entry_id)
    return raw


def update_worldbook(entry_id: str, updates: Dict) -> Dict:
    """更新世界书条目"""
    _validate_entry_id(entry_id)
    filepath = os.path.join(WORLDBOOKS_DIR, f"{entry_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"世界书条目不存在: {entry_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        existing = json.load(f)

    existing.update(updates)

    entry = WorldBookEntry.model_validate(existing)
    raw = entry.model_dump()

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    _clear_cache()
    logger.info("更新世界书条目: %s", entry_id)
    return raw


def delete_worldbook(entry_id: str) -> None:
    """删除世界书条目"""
    _validate_entry_id(entry_id)
    filepath = os.path.join(WORLDBOOKS_DIR, f"{entry_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"世界书条目不存在: {entry_id}")

    os.remove(filepath)
    _clear_cache()
    logger.info("删除世界书条目: %s", entry_id)


def _clear_cache():
    """清除缓存"""
    global _cached_entries
    _cached_entries = None
