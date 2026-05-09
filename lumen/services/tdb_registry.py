"""
TDB Registry — TriviumDB 实例统一注册表

职责：
1. 提供唯一的 TDB 实例获取入口 get_tdb(name)
2. 动态发现知识库 TDB（基于 manifest），无需白名单
3. 列出用户可见的 TDB（前端标签页用）

设计决策：
- _open_tdb() 从 knowledge/_core.py 搬来，斩断循环依赖
- 知识库 TDB 通过 manifest 动态发现，新增知识库零手动注册
- 系统 TDB（memory）硬编码路由，数量固定
- 实例懒加载 + 缓存，无 LRU（桌面应用 <20 个 TDB，长活即可）
"""

import os
import logging
import threading
from typing import Optional, Dict, List

import triviumdb

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_LUMEN_DIR = os.path.join(_PROJECT_ROOT, "lumen")

# 不对用户暴露的内部 TDB
_INTERNAL = {"knowledge_sentences"}

# 知识库 TDB 的标准属性索引字段
_KB_INDEX_FIELDS = ["owner_id", "type", "status", "source"]

# 实例缓存 + 锁（double-check locking）
_instances: Dict[str, triviumdb.TriviumDB] = {}
_lock = threading.Lock()


def _open_tdb(path: str, dim: int, index_fields: list[str] = None) -> triviumdb.TriviumDB:
    """创建 TriviumDB 实例（目录创建 + auto_compaction + 属性索引）"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    db = triviumdb.TriviumDB(path, dim=dim)
    try:
        db.enable_auto_compaction(7200)
    except Exception:
        pass
    if index_fields:
        for field in index_fields:
            try:
                db.create_index(field)
            except Exception:
                pass
    return db


def _resolve_kb_path(name: str) -> Optional[str]:
    """通过 manifest 查找知识库 TDB 的绝对路径，找不到返回 None"""
    from lumen.services.knowledge.manifest import load_kb_manifest, ensure_manifest_for_existing_kb
    try:
        manifest = load_kb_manifest(name)
    except Exception:
        logger.warning(f"知识库 {name} 的 manifest 读取失败")
        return None
    if not manifest:
        # 知识库文件夹存在但无 manifest → 自动创建
        try:
            manifest = ensure_manifest_for_existing_kb(name)
        except Exception:
            return None
    if not manifest or not manifest.get("tdb_path"):
        return None
    return os.path.join(_LUMEN_DIR, manifest["tdb_path"])


def get_tdb(name: str) -> triviumdb.TriviumDB:
    """统一获取 TDB 实例（懒加载 + 缓存，线程安全）

    支持两类 TDB：
    - 系统 TDB（"memory"）→ 路由到对应模块的 _get_db()
    - 知识库 TDB → manifest 查路径 → _open_tdb() 创建实例

    Raises:
        ValueError: 未知的 TDB 名称
        FileNotFoundError: manifest 存在但 .tdb 文件不存在
    """
    if name in _instances:
        return _instances[name]

    with _lock:
        if name in _instances:
            return _instances[name]

        # ── 系统 TDB ──
        if name == "memory":
            from lumen.services.search.vector_store import _get_db as _vs_get_db
            db = _vs_get_db()
            _instances[name] = db
            return db

        # ── 知识库 TDB（动态发现）──
        tdb_path = _resolve_kb_path(name)
        if tdb_path is None:
            raise ValueError(f"未知 TDB: {name}")

        if not os.path.exists(tdb_path):
            raise FileNotFoundError(f"TDB 文件不存在: {tdb_path}")

        from lumen.services.search.embedding import resolve_dimensions, check_dim_consistency, _save_dim_file
        dim = resolve_dimensions(name)
        err = check_dim_consistency(tdb_path, dim)
        if err:
            raise RuntimeError(err)
        db = _open_tdb(tdb_path, dim, _KB_INDEX_FIELDS)
        _save_dim_file(tdb_path, dim)
        _instances[name] = db
        logger.info(f"TDB Registry 已打开: {name} ({tdb_path}, dim={dim})")
        return db


def is_user_tdb(name: str) -> bool:
    """是否是对用户可见的 TDB（非内部 TDB）"""
    if name in _INTERNAL:
        return False
    if name == "memory":
        return True
    # 知识库 TDB — 有 manifest 就算可见
    return _resolve_kb_path(name) is not None


def list_user_tdbs() -> List[dict]:
    """列出所有用户可见的 TDB

    返回格式与旧 config/tdbs 接口一致：[{"name", "filename", "size"}]
    系统 TDB + manifest 扫描的知识库 TDB 合并返回。
    """
    from lumen.services.knowledge.manifest import list_kbs

    tdbs = []

    # ── 系统 TDB ──
    _SYSTEM = {"memory"}
    for sys_name in sorted(_SYSTEM):
        # 找文件路径和大小
        filename = f"{sys_name}.tdb"
        size = 0
        for subdir in ("lumen/data/tdb/local", "lumen/data/tdb/api"):
            candidate = os.path.join(_PROJECT_ROOT, subdir, filename)
            if os.path.exists(candidate):
                size = os.path.getsize(candidate)
                break
        tdbs.append({"name": sys_name, "filename": filename, "size": size})

    # ── 知识库 TDB（动态发现）──
    try:
        for kb in list_kbs():
            name = kb.get("name", "")
            if not name or name in _INTERNAL:
                continue
            tdb_path = _resolve_kb_path(name)
            filename = os.path.basename(tdb_path) if tdb_path else f"{name}.tdb"
            size = os.path.getsize(tdb_path) if tdb_path and os.path.exists(tdb_path) else 0
            tdbs.append({"name": name, "filename": filename, "size": size})
    except Exception as e:
        logger.warning(f"扫描知识库 TDB 失败（返回已有结果）: {e}")

    return tdbs


def close_all():
    """关闭所有缓存的 TDB 实例（退出时调用）"""
    with _lock:
        for name, db in _instances.items():
            try:
                db.flush()
                logger.info(f"TDB Registry 已关闭: {name}")
            except Exception:
                pass
        _instances.clear()
