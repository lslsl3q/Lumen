"""知识库扫描服务 — MD5 变更检测 + 新知识库发现"""
import hashlib
import json
import os
from typing import Optional

from lumen.config import KNOWLEDGE_LIB_DIR


def _md5_file(filepath: str) -> str:
    """计算文件 MD5"""
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_registry(kb_dir: str) -> dict:
    """加载知识库的 _registry.json"""
    reg_path = os.path.join(kb_dir, "_registry.json")
    if not os.path.exists(reg_path):
        return {}
    with open(reg_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_registry(kb_dir: str, registry: dict) -> None:
    """保存知识库的 _registry.json"""
    os.makedirs(kb_dir, exist_ok=True)
    reg_path = os.path.join(kb_dir, "_registry.json")
    with open(reg_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)


def _walk_files(directory: str) -> list[str]:
    """遍历目录下所有 .txt/.md/.markdown 文件（跳过 _ 前缀文件）"""
    results = []
    for root, dirs, files in os.walk(directory):
        for fname in files:
            if fname.startswith("_"):
                continue
            if not fname.endswith((".txt", ".md", ".markdown")):
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, directory)
            results.append(rel)
    return results


def scan_knowledge_lib() -> dict:
    """扫描整个知识库目录，返回变更列表。

    Returns:
        {
            "new_kbs": [{"folder": "跑团世界"}],
            "added": [{"kb": "knowledge", "path": "世界观/新设定.md", "md5": "..."}],
            "modified": [{"kb": "knowledge", "path": "...", "file_id": "...", "old_md5": "...", "new_md5": "..."}],
            "deleted": [{"kb": "knowledge", "path": "...", "file_id": "..."}]
        }
    """
    if not os.path.exists(KNOWLEDGE_LIB_DIR):
        return {"new_kbs": [], "added": [], "modified": [], "deleted": []}

    result = {"new_kbs": [], "added": [], "modified": [], "deleted": []}

    for entry in sorted(os.listdir(KNOWLEDGE_LIB_DIR)):
        entry_path = os.path.join(KNOWLEDGE_LIB_DIR, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry.startswith("_") or entry.startswith("."):
            continue

        has_registry = os.path.exists(os.path.join(entry_path, "_registry.json"))
        if not has_registry:
            result["new_kbs"].append({"folder": entry})
            continue

        registry = _load_registry(entry_path)
        path_to_id = {}
        for fid, info in registry.items():
            path_to_id[info.get("source_path", "")] = fid

        disk_files = set(_walk_files(entry_path))
        registered_paths = set(path_to_id.keys())

        for path in sorted(disk_files - registered_paths):
            full = os.path.join(entry_path, path)
            result["added"].append({
                "kb": entry,
                "path": path,
                "md5": _md5_file(full),
            })

        for path in sorted(disk_files & registered_paths):
            full = os.path.join(entry_path, path)
            new_md5 = _md5_file(full)
            fid = path_to_id[path]
            old_md5 = registry[fid].get("md5", "")
            if new_md5 != old_md5:
                result["modified"].append({
                    "kb": entry,
                    "path": path,
                    "file_id": fid,
                    "old_md5": old_md5,
                    "new_md5": new_md5,
                })

        for path in sorted(registered_paths - disk_files):
            fid = path_to_id[path]
            result["deleted"].append({
                "kb": entry,
                "path": path,
                "file_id": fid,
            })

    return result


def update_registry_entry(kb_name: str, file_id: str, **fields) -> None:
    """更新 registry 中某个文件的字段"""
    kb_dir = os.path.join(KNOWLEDGE_LIB_DIR, kb_name)
    registry = _load_registry(kb_dir)
    if file_id in registry:
        registry[file_id].update(fields)
        _save_registry(kb_dir, registry)


def remove_registry_entry(kb_name: str, file_id: str) -> None:
    """从 registry 中删除一个文件条目"""
    kb_dir = os.path.join(KNOWLEDGE_LIB_DIR, kb_name)
    registry = _load_registry(kb_dir)
    registry.pop(file_id, None)
    _save_registry(kb_dir, registry)


def get_dirty_files(kb_name: Optional[str] = None) -> list[dict]:
    """获取有 graph_sync_needed=true 的文件列表"""
    results = []
    if not os.path.exists(KNOWLEDGE_LIB_DIR):
        return results

    kbs_to_check = [kb_name] if kb_name else [
        e for e in sorted(os.listdir(KNOWLEDGE_LIB_DIR))
        if os.path.isdir(os.path.join(KNOWLEDGE_LIB_DIR, e)) and not e.startswith("_")
    ]

    for kb in kbs_to_check:
        registry = _load_registry(os.path.join(KNOWLEDGE_LIB_DIR, kb))
        for fid, info in registry.items():
            if info.get("graph_sync_needed"):
                results.append({"kb": kb, "file_id": fid, **info})

    return results
