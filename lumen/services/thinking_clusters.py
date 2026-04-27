"""
Lumen - 思维簇引擎
VCP MetaThinkingManager 的 Python 重实现，融入 Lumen 的异步架构

核心机制：把思维模式变成可检索的语义对象
- 每个簇目录包含多个 .txt 思维模块
- chains.json 定义链的执行顺序和参数
- 向量检索找到最相关的思维模块
- 向量融合让后续簇能"看到"前一步的结果
"""

import hashlib
import json
import logging
import os
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import numpy as np

from lumen.config import (
    THINKING_CLUSTERS_DIR,
    THINKING_CLUSTERS_DB_PATH,
)
from lumen.types.thinking_clusters import (
    ChainConfig,
    PipelineResult,
    RetrievedModule,
)

logger = logging.getLogger(__name__)

# ── 模块级状态 ──

_db = None              # TriviumDB 单例
_index_cache = {}       # {相对路径: {hash, node_id}}
_loaded = False
_lock = None            # asyncio.Lock，延迟初始化


def _get_lock():
    """延迟创建 asyncio.Lock（避免模块加载时没有事件循环）"""
    global _lock
    if _lock is None:
        import asyncio
        _lock = asyncio.Lock()
    return _lock


def _get_db():
    """获取 TriviumDB 实例（单例）"""
    global _db
    if _db is None:
        import triviumdb
        # 从嵌入服务获取维度
        from lumen.services.embedding import get_dimensions
        dim = get_dimensions("thinking_clusters")
        if dim == 0:
            dim = 512  # fallback
        _db = triviumdb.TriviumDB(THINKING_CLUSTERS_DB_PATH, dim=dim)
        logger.info(f"思维簇 TriviumDB 已打开: {THINKING_CLUSTERS_DB_PATH} (维度: {dim})")
    return _db


# ── 索引管理 ──

def _scan_txt_files() -> list[tuple[str, str, str]]:
    """扫描思维簇目录，返回 [(相对路径, 簇名, 绝对路径), ...]

    目录结构：thinking_clusters/<簇名>/<模块>.txt
    """
    base = Path(THINKING_CLUSTERS_DIR)
    if not base.exists():
        return []

    results = []
    for cluster_dir in sorted(base.iterdir()):
        if not cluster_dir.is_dir():
            continue
        if cluster_dir.name.startswith("_") or cluster_dir.name.startswith("."):
            continue
        for txt_file in sorted(cluster_dir.glob("*.txt")):
            rel_path = f"{cluster_dir.name}/{txt_file.name}"
            results.append((rel_path, cluster_dir.name, str(txt_file)))

    return results


def _file_hash(filepath: str) -> str:
    """计算文件内容的 MD5 哈希"""
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_index_cache() -> dict:
    """从磁盘加载索引缓存"""
    cache_path = os.path.join(THINKING_CLUSTERS_DIR, "_index_cache.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_index_cache(cache: dict):
    """保存索引缓存到磁盘"""
    cache_path = os.path.join(THINKING_CLUSTERS_DIR, "_index_cache.json")
    os.makedirs(THINKING_CLUSTERS_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


async def ensure_indexed() -> None:
    """扫描思维簇目录，为新/修改的文件建立向量索引

    幂等操作：多次调用只处理增量变化。
    """
    async with _get_lock():
        await _do_index()


async def _do_index():
    """实际的索引逻辑（在锁内执行）"""
    global _index_cache, _loaded

    # 确保嵌入服务可用
    from lumen.services.embedding import get_service
    backend = await get_service("thinking_clusters")
    if backend is None:
        logger.warning("嵌入服务不可用，思维簇索引跳过")
        return

    db = _get_db()
    old_cache = _load_index_cache()
    new_cache = {}
    files = _scan_txt_files()

    if not files:
        _index_cache = {}
        _loaded = True
        return

    embedded_count = 0
    deleted_count = 0

    for rel_path, cluster, abs_path in files:
        content_hash = _file_hash(abs_path)
        old_entry = old_cache.get(rel_path)

        if old_entry and old_entry.get("hash") == content_hash:
            # 文件未变，保留旧索引
            new_cache[rel_path] = old_entry
            continue

        # 文件新增或修改 → 删旧索引（如有），建新索引
        if old_entry and "node_id" in old_entry:
            try:
                db.delete(old_entry["node_id"])
            except Exception:
                pass
            deleted_count += 1

        # 读取内容
        try:
            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
        except Exception as e:
            logger.warning(f"读取思维模块失败 {rel_path}: {e}")
            continue

        if not content:
            continue

        # 编码向量
        vector = await backend.encode(content)
        if not vector:
            logger.warning(f"编码思维模块失败 {rel_path}")
            continue

        # 存入 TriviumDB
        node_id = db.insert(
            vector,
            {
                "cluster": cluster,
                "filename": rel_path,
                "content": content,
            },
        )
        new_cache[rel_path] = {"hash": content_hash, "node_id": node_id}
        embedded_count += 1

    # 删除已移除的文件
    for old_path in set(old_cache.keys()) - set(new_cache.keys()):
        old_entry = old_cache[old_path]
        if "node_id" in old_entry:
            try:
                db.delete(old_entry["node_id"])
            except Exception:
                pass
            deleted_count += 1

    _save_index_cache(new_cache)
    _index_cache = new_cache
    _loaded = True

    if embedded_count > 0 or deleted_count > 0:
        logger.info(f"思维簇索引完成: {len(new_cache)} 个模块, 新嵌入 {embedded_count}, 删除 {deleted_count}")
    else:
        logger.debug(f"思维簇索引无变化: {len(new_cache)} 个模块")


# ── 链配置 ──

def get_chain_config(chain_name: str) -> ChainConfig:
    """从 chains.json 加载指定链的配置

    找不到时返回空链（实际禁用该功能）。
    """
    chains_path = os.path.join(THINKING_CLUSTERS_DIR, "chains.json")
    if not os.path.exists(chains_path):
        return ChainConfig(name=chain_name, steps=[])

    try:
        with open(chains_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        logger.warning(f"读取 chains.json 失败: {e}")
        return ChainConfig(name=chain_name, steps=[])

    chains = data.get("chains", {})
    chain_data = chains.get(chain_name)
    if not chain_data:
        return ChainConfig(name=chain_name, steps=[])

    return ChainConfig(**chain_data)


def list_chains() -> list[dict]:
    """列出所有可用的链配置"""
    chains_path = os.path.join(THINKING_CLUSTERS_DIR, "chains.json")
    if not os.path.exists(chains_path):
        return []

    try:
        with open(chains_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return [
            {"name": name, "steps": len(chain.get("steps", []))}
            for name, chain in data.get("chains", {}).items()
        ]
    except Exception:
        return []


# ── 管道执行 ──

async def run_chain(
    query_vector: list[float],
    chain_config: ChainConfig,
    character_config: dict,
) -> PipelineResult:
    """执行思维簇管道

    对链中的每个步骤：
    1. 用当前查询向量搜索该簇的 .txt 文件
    2. 取 top_k 个最相关结果
    3. 向量融合：更新查询向量（0.8 原始 + 0.2 结果均值）
    4. 收集检索到的模块

    最后按 token 预算裁剪，格式化输出。
    """
    if not chain_config.steps:
        return _empty_result()

    if not _loaded:
        await ensure_indexed()

    db = _get_db()
    current_vector = np.array(query_vector, dtype=np.float64)
    all_modules: list[RetrievedModule] = []
    degraded: list[str] = []

    token_budget = (
        character_config.get("thinking_clusters_token_budget")
        or chain_config.token_budget
    )

    for step in chain_config.steps:
        # 向量搜索
        raw_results = db.search(
            current_vector.tolist(),
            top_k=step.top_k * 3,  # 多搜一些，后面按簇过滤
            min_score=step.min_score,
        )

        # 过滤：只保留属于当前簇的结果
        hits = []
        for hit in raw_results:
            payload = getattr(hit, "payload", {}) or {}
            if payload.get("cluster") == step.cluster:
                score = getattr(hit, "score", 0.0)
                if score >= step.min_score:
                    hits.append((hit, payload, score))

        # 按相似度排序，取 top_k
        hits.sort(key=lambda x: x[2], reverse=True)
        hits = hits[:step.top_k]

        if not hits:
            degraded.append(step.cluster)
            continue

        # 收集模块
        for hit, payload, score in hits:
            all_modules.append(RetrievedModule(
                cluster=step.cluster,
                filename=payload.get("filename", ""),
                content=payload.get("content", ""),
                score=round(score, 4),
                tokens=0,
            ))

        # 向量融合
        await _fuse_vector(
            current_vector,
            [h[0] for h in hits],
            chain_config.fusion_weight_query,
            chain_config.fusion_weight_results,
        )

    # Token 预算裁剪
    from lumen.services.context.token_estimator import estimate_text_tokens

    used_tokens = 0
    final_modules: list[RetrievedModule] = []
    for mod in sorted(all_modules, key=lambda x: x["score"], reverse=True):
        mod_tokens = estimate_text_tokens(mod["content"])
        if used_tokens + mod_tokens > token_budget:
            continue
        mod["tokens"] = mod_tokens
        final_modules.append(mod)
        used_tokens += mod_tokens

    # 格式化
    from lumen.prompt.thinking_injector import format_modules
    injection_text = format_modules(final_modules)

    if degraded:
        logger.debug(f"思维簇降级: {degraded}")

    return PipelineResult(
        modules=final_modules,
        injection_text=injection_text,
        total_tokens=used_tokens,
        degraded_clusters=degraded,
    )


async def _fuse_vector(
    current_vector: np.ndarray,
    hits: list,
    weight_query: float,
    weight_results: float,
) -> None:
    """向量融合：current_vector = weight_query * query + weight_results * mean(results)

    因为 TriviumDB 不返回原始向量，所以对命中文本重新编码取均值。
    只对 3-5 条命中文本编码，开销约 50ms。
    """
    from lumen.services.embedding import get_service

    texts = []
    for hit in hits:
        payload = getattr(hit, "payload", {}) or {}
        content = payload.get("content", "")
        if content:
            texts.append(content)

    if not texts:
        return

    backend = await get_service("thinking_clusters")
    if backend is None:
        return
    result_vectors = await backend.encode_batch(texts)
    if not result_vectors:
        return

    mean_result = np.mean(np.array(result_vectors, dtype=np.float64), axis=0)
    fused = weight_query * current_vector + weight_results * mean_result
    current_vector[:] = fused


def _empty_result() -> PipelineResult:
    """空结果（链无步骤或功能禁用时返回）"""
    return PipelineResult(
        modules=[],
        injection_text="",
        total_tokens=0,
        degraded_clusters=[],
    )


def close():
    """关闭 TriviumDB 实例"""
    global _db, _loaded, _index_cache
    if _db is not None:
        _db.flush()
        _db = None
    _loaded = False
    _index_cache = {}
