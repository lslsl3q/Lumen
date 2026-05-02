"""_manifest.json 管理 — 每个知识库一个自包含清单"""
import json
import os
import shutil
from datetime import datetime
from typing import Optional

from lumen.config import KNOWLEDGE_LIB_DIR


def kb_manifest_path(name: str) -> str:
    """知识库 _manifest.json 路径"""
    return os.path.join(KNOWLEDGE_LIB_DIR, name, "_manifest.json")


def load_kb_manifest(name: str) -> Optional[dict]:
    """加载知识库的 _manifest.json"""
    path = kb_manifest_path(name)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_kb_manifest(name: str, manifest: dict) -> None:
    """写入知识库的 _manifest.json"""
    kb_dir = os.path.join(KNOWLEDGE_LIB_DIR, name)
    os.makedirs(kb_dir, exist_ok=True)
    path = kb_manifest_path(name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def list_kbs() -> list[dict]:
    """扫描所有知识库（动态发现）"""
    if not os.path.exists(KNOWLEDGE_LIB_DIR):
        return []
    results = []
    for entry in sorted(os.listdir(KNOWLEDGE_LIB_DIR)):
        entry_path = os.path.join(KNOWLEDGE_LIB_DIR, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry.startswith("_") or entry.startswith("."):
            continue
        manifest = load_kb_manifest(entry)
        if manifest:
            results.append({"name": entry, **manifest})
        else:
            results.append({"name": entry})
    return results


def get_kb(name: str) -> Optional[dict]:
    """获取单个知识库信息"""
    return load_kb_manifest(name)


def create_kb(name: str, tdb_path: str, graph_path: Optional[str] = None,
              sentence_path: Optional[str] = None, embedding_camp: str = "api") -> dict:
    """创建新知识库（文件夹 + _manifest.json）"""
    manifest = {
        "tdb_path": tdb_path,
        "graph_path": graph_path,
        "sentence_path": sentence_path,
        "embedding_camp": embedding_camp,
        "access_mode": "public",
        "allowed_characters": [],
        "created_at": datetime.now().isoformat(),
        "files": {},
    }
    save_kb_manifest(name, manifest)
    return {"name": name, **manifest}


def delete_kb(name: str) -> None:
    """删除知识库（整个文件夹）"""
    kb_dir = os.path.join(KNOWLEDGE_LIB_DIR, name)
    if os.path.exists(kb_dir):
        shutil.rmtree(kb_dir)


def ensure_manifest_for_existing_kb(name: str) -> dict:
    """确保现有知识库有 _manifest.json。如果已有直接返回，否则自动创建。"""
    existing = load_kb_manifest(name)
    if existing:
        return existing

    defaults = {
        "knowledge": {
            "tdb_path": "data/vectors/api/knowledge.tdb",
            "graph_path": "data/graphs/kb_knowledge.tdb",
            "sentence_path": "data/vectors/local/knowledge_sentences.tdb",
        },
        "agent_knowledge": {
            "tdb_path": "data/vectors/api/agent_knowledge.tdb",
            "graph_path": None,
            "sentence_path": None,
        },
    }
    info = defaults.get(name, {
        "tdb_path": f"data/vectors/api/kb_{name}.tdb",
        "graph_path": f"data/graphs/kb_{name}.tdb",
        "sentence_path": f"data/vectors/local/knowledge_sentences_{name}.tdb",
    })
    return create_kb(name, **info)
