"""
思维簇管理 API
查看/编辑思维模块 + 管理 chains 配置
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import json
import os

router = APIRouter()

from lumen.config import THINKING_CLUSTERS_DIR


# ── 数据模型 ──

class ModuleSaveRequest(BaseModel):
    path: str       # 相对路径，如 "task_context/example.txt"
    content: str    # 模块内容


class ModuleCreateRequest(BaseModel):
    cluster: str    # 簇名
    name: str       # 文件名（不含 .txt 后缀）
    content: str    # 初始内容


class ChainsSaveRequest(BaseModel):
    content: str    # chains.json 的 JSON 字符串


# ── 辅助函数 ──

def _safe_path(rel_path: str) -> str:
    """防止路径遍历攻击"""
    clean = os.path.normpath(rel_path).replace("\\", "/")
    if clean.startswith("..") or "/.." in clean:
        raise ValueError("非法路径")
    return clean


# ── 端点 ──

@router.get("/tree")
async def get_tree():
    """列出所有簇及其模块文件"""
    base = THINKING_CLUSTERS_DIR
    if not os.path.isdir(base):
        return {"clusters": []}

    clusters = []
    for entry in sorted(os.listdir(base)):
        entry_path = os.path.join(base, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry.startswith("_") or entry.startswith("."):
            continue

        modules = []
        for fname in sorted(os.listdir(entry_path)):
            if fname.endswith(".txt"):
                modules.append(fname)

        clusters.append({
            "name": entry,
            "modules": modules,
        })

    return {"clusters": clusters}


@router.get("/module")
async def get_module(path: str = Query(..., description="相对路径，如 task_context/example.txt")):
    """读取单个思维模块内容"""
    try:
        rel = _safe_path(path)
    except ValueError:
        raise HTTPException(400, "非法路径")

    full_path = os.path.join(THINKING_CLUSTERS_DIR, rel)
    if not os.path.isfile(full_path):
        raise HTTPException(404, f"模块不存在: {path}")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(500, f"读取失败: {e}")


@router.put("/module")
async def save_module(req: ModuleSaveRequest):
    """保存/更新思维模块"""
    try:
        rel = _safe_path(req.path)
    except ValueError:
        raise HTTPException(400, "非法路径")

    full_path = os.path.join(THINKING_CLUSTERS_DIR, rel)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    try:
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"message": f"已保存: {req.path}"}
    except Exception as e:
        raise HTTPException(500, f"保存失败: {e}")


@router.post("/module")
async def create_module(req: ModuleCreateRequest):
    """创建新的思维模块"""
    if not req.name.endswith(".txt"):
        filename = req.name + ".txt"
    else:
        filename = req.name

    try:
        _safe_path(f"{req.cluster}/{filename}")
    except ValueError:
        raise HTTPException(400, "非法名称")

    cluster_dir = os.path.join(THINKING_CLUSTERS_DIR, req.cluster)
    os.makedirs(cluster_dir, exist_ok=True)
    full_path = os.path.join(cluster_dir, filename)

    if os.path.exists(full_path):
        raise HTTPException(409, f"模块已存在: {req.cluster}/{filename}")

    try:
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"message": f"已创建: {req.cluster}/{filename}", "path": f"{req.cluster}/{filename}"}
    except Exception as e:
        raise HTTPException(500, f"创建失败: {e}")


@router.delete("/module")
async def delete_module(path: str = Query(..., description="相对路径")):
    """删除思维模块"""
    try:
        rel = _safe_path(path)
    except ValueError:
        raise HTTPException(400, "非法路径")

    full_path = os.path.join(THINKING_CLUSTERS_DIR, rel)
    if not os.path.isfile(full_path):
        raise HTTPException(404, f"模块不存在: {path}")

    try:
        os.remove(full_path)
        return {"message": f"已删除: {path}"}
    except Exception as e:
        raise HTTPException(500, f"删除失败: {e}")


@router.get("/chains")
async def get_chains():
    """读取 chains.json 配置"""
    chains_path = os.path.join(THINKING_CLUSTERS_DIR, "chains.json")
    if not os.path.isfile(chains_path):
        return {"content": "{}", "parsed": {}}

    try:
        with open(chains_path, "r", encoding="utf-8") as f:
            content = f.read()
        parsed = json.loads(content)
        return {"content": content, "parsed": parsed}
    except Exception as e:
        raise HTTPException(500, f"读取失败: {e}")


@router.put("/chains")
async def save_chains(req: ChainsSaveRequest):
    """保存 chains.json 配置"""
    try:
        parsed = json.loads(req.content)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"JSON 格式错误: {e}")

    chains_path = os.path.join(THINKING_CLUSTERS_DIR, "chains.json")
    try:
        with open(chains_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, ensure_ascii=False, indent=2)
        return {"message": "chains.json 已保存"}
    except Exception as e:
        raise HTTPException(500, f"保存失败: {e}")


@router.post("/reindex")
async def reindex():
    """触发向量索引重建"""
    try:
        from lumen.services.thinking_clusters import ensure_indexed
        await ensure_indexed()
        return {"message": "索引重建完成"}
    except Exception as e:
        raise HTTPException(500, f"索引重建失败: {e}")
