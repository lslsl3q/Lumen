"""_manifest.json 管理 — 知识库注册表"""
import json
import os
from datetime import datetime
from typing import Optional

from lumen.config import MANIFEST_PATH


def _default_manifest() -> dict:
    return {"version": 1, "knowledge_bases": {}}


def load_manifest() -> dict:
    """加载 _manifest.json，不存在则返回空模板"""
    if not os.path.exists(MANIFEST_PATH):
        return _default_manifest()
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_manifest(manifest: dict) -> None:
    """写入 _manifest.json"""
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def register_kb(folder_name: str, tdb_path: str, graph_path: Optional[str] = None,
                sentence_path: Optional[str] = None, embedding_camp: str = "api") -> dict:
    """注册一个知识库到 manifest"""
    manifest = load_manifest()
    entry = {
        "folder": folder_name,
        "tdb_path": tdb_path,
        "graph_path": graph_path,
        "sentence_path": sentence_path,
        "embedding_camp": embedding_camp,
        "created_at": datetime.now().isoformat(),
    }
    manifest["knowledge_bases"][folder_name] = entry
    save_manifest(manifest)
    return entry


def unregister_kb(folder_name: str) -> None:
    """从 manifest 注销知识库"""
    manifest = load_manifest()
    manifest["knowledge_bases"].pop(folder_name, None)
    save_manifest(manifest)


def list_kbs() -> list[dict]:
    """列出所有已注册知识库"""
    manifest = load_manifest()
    return [
        {"name": name, **info}
        for name, info in manifest["knowledge_bases"].items()
    ]


def get_kb(folder_name: str) -> Optional[dict]:
    """获取单个知识库信息"""
    manifest = load_manifest()
    return manifest["knowledge_bases"].get(folder_name)


def ensure_manifest_for_existing_kb(folder_name: str) -> dict:
    """确保现有知识库（knowledge/agent_knowledge）在 manifest 中注册。
    如果已注册直接返回，否则自动注册。"""
    existing = get_kb(folder_name)
    if existing:
        return existing

    # 已有的两个知识库保持原有 TDB 路径
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
    info = defaults.get(folder_name, {
        "tdb_path": f"data/vectors/api/kb_{folder_name}.tdb",
        "graph_path": f"data/graphs/kb_{folder_name}.tdb",
        "sentence_path": f"data/vectors/local/knowledge_sentences_{folder_name}.tdb",
    })
    return register_kb(folder_name, **info)
