"""
Rerank 多服务商管理 API

GET    /rerank/providers           — 返回所有服务商（API key 脱敏）
POST   /rerank/providers           — 添加服务商
PUT    /rerank/providers/{id}      — 更新服务商
DELETE /rerank/providers/{id}      — 删除服务商（如为活跃则清除）
PUT    /rerank/active              — 切换活跃服务商
PUT    /rerank/settings            — 更新全局设置
GET    /rerank/status              — 返回当前状态
POST   /rerank/test                — 测试连通性
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumen.config import RERANK_CONFIG_PATH

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(RERANK_CONFIG_PATH)

_DEFAULT_CONFIG = {
    "enabled": False,
    "active_provider": "",
    "top_k": 10,
    "min_score": 0.3,
    "providers": [],
}


# ── 配置读写 ──


def _load_config() -> dict:
    """加载 rerank 配置，文件不存在时创建默认配置"""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"读取 rerank 配置失败: {e}")
    return dict(_DEFAULT_CONFIG)


def _save_config(config: dict):
    """保存配置到磁盘，自动创建目录"""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def _mask_key(key: str) -> str:
    """脱敏 API key：仅显示前 4 位 + ***"""
    if not key:
        return ""
    if len(key) <= 4:
        return "***"
    return key[:4] + "***"


def _reload():
    """保存后清除 rerank 服务缓存"""
    from lumen.services.knowledge.rerank import reload_rerank_config
    reload_rerank_config()


def _find_provider(config: dict, provider_id: str) -> dict | None:
    """按 id 查找服务商"""
    for p in config.get("providers", []):
        if p.get("id") == provider_id:
            return p
    return None


# ── Pydantic 模型 ──


class ProviderCreate(BaseModel):
    name: str
    api_url: str
    api_key: str
    model: str
    max_doc_chars: int = 0


class ProviderUpdate(BaseModel):
    name: str | None = None
    api_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    max_doc_chars: int | None = None


class ActiveSwitch(BaseModel):
    provider_id: str


class SettingsUpdate(BaseModel):
    enabled: bool | None = None
    top_k: int | None = None
    min_score: float | None = None


class TestRequest(BaseModel):
    provider_id: str | None = None
    query: str = "什么是人工智能"
    documents: list[str] = ["人工智能是计算机科学的一个分支", "今天天气很好"]


# ── 路由 ──

router = APIRouter(prefix="/rerank", tags=["rerank"])


@router.get("/providers")
async def list_providers():
    """返回所有服务商（API key 脱敏）"""
    config = _load_config()
    active_id = config.get("active_provider", "")
    providers = []
    for p in config.get("providers", []):
        providers.append({
            **p,
            "api_key": _mask_key(p.get("api_key", "")),
            "is_active": p.get("id") == active_id,
        })
    return {"providers": providers}


@router.post("/providers")
async def add_provider(body: ProviderCreate):
    """添加新的 rerank 服务商"""
    config = _load_config()

    # 生成唯一 id：取 name 的拼音首字母或用序号
    # 简单方案：用 name 的 hash 前 8 位
    provider_id = str(abs(hash(body.name)))[:8]
    # 确保不重复
    existing_ids = {p.get("id") for p in config.get("providers", [])}
    while provider_id in existing_ids:
        provider_id = str(abs(hash(body.name + provider_id)))[:8]

    provider = {
        "id": provider_id,
        "name": body.name,
        "api_url": body.api_url,
        "api_key": body.api_key,
        "model": body.model,
        "max_doc_chars": body.max_doc_chars,
    }
    config.setdefault("providers", []).append(provider)
    _save_config(config)
    _reload()

    return {"id": provider_id, "message": "服务商添加成功"}


@router.put("/providers/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpdate):
    """更新指定服务商配置"""
    config = _load_config()
    provider = _find_provider(config, provider_id)
    if provider is None:
        raise HTTPException(404, f"服务商不存在: {provider_id}")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        provider[key] = value

    _save_config(config)
    _reload()

    return {"message": "服务商更新成功"}


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str):
    """删除服务商（如为活跃服务商则同时清除 active_provider）"""
    config = _load_config()
    providers = config.get("providers", [])
    new_providers = [p for p in providers if p.get("id") != provider_id]

    if len(new_providers) == len(providers):
        raise HTTPException(404, f"服务商不存在: {provider_id}")

    config["providers"] = new_providers

    # 如果删除的是活跃服务商，清除引用
    if config.get("active_provider") == provider_id:
        config["active_provider"] = ""

    _save_config(config)
    _reload()

    return {"message": "服务商删除成功"}


@router.put("/active")
async def set_active(body: ActiveSwitch):
    """切换活跃服务商"""
    config = _load_config()

    provider = _find_provider(config, body.provider_id)
    if provider is None:
        raise HTTPException(404, f"服务商不存在: {body.provider_id}")

    config["active_provider"] = body.provider_id
    _save_config(config)
    _reload()

    return {"message": f"已切换活跃服务商: {provider.get('name', body.provider_id)}"}


@router.put("/settings")
async def update_settings(body: SettingsUpdate):
    """更新全局 rerank 设置"""
    config = _load_config()

    updates = body.model_dump(exclude_unset=True)
    config.update(updates)

    _save_config(config)
    _reload()

    return {"message": "设置更新成功"}


@router.get("/status")
async def get_status():
    """返回 rerank 当前状态"""
    config = _load_config()

    active_id = config.get("active_provider", "")
    active_name = ""
    if active_id:
        p = _find_provider(config, active_id)
        if p:
            active_name = p.get("name", "")

    return {
        "enabled": config.get("enabled", False),
        "active_provider_id": active_id,
        "active_provider_name": active_name,
        "top_k": config.get("top_k", 10),
        "min_score": config.get("min_score", 0.3),
        "provider_count": len(config.get("providers", [])),
    }


@router.post("/test")
async def test_connection(body: TestRequest):
    """测试 rerank 服务商连通性

    如果指定 provider_id 则测试该服务商，否则测试当前活跃服务商。
    """
    from lumen.services.knowledge.rerank import test_rerank_connection

    config = _load_config()

    if body.provider_id:
        # 测试指定服务商
        provider = _find_provider(config, body.provider_id)
        if provider is None:
            raise HTTPException(404, f"服务商不存在: {body.provider_id}")
    else:
        # 测试当前活跃服务商
        active_id = config.get("active_provider", "")
        if not active_id:
            raise HTTPException(400, "无活跃服务商，请先指定 provider_id 或设置活跃服务商")
        provider = _find_provider(config, active_id)
        if provider is None:
            raise HTTPException(404, f"活跃服务商配置丢失: {active_id}")

    # 使用自定义 query/documents 或默认值
    test_config = {
        "api_url": provider["api_url"],
        "api_key": provider["api_key"],
        "model": provider["model"],
        "max_doc_chars": provider.get("max_doc_chars", 0),
    }

    # 如果用户提供了自定义 query/documents，临时构建测试
    if body.query != "什么是人工智能" or body.documents != ["人工智能是计算机科学的一个分支", "今天天气很好"]:
        # 自定义测试 — 直接调用底层 API
        import time
        import httpx
        start = time.time()
        try:
            resp = httpx.post(
                test_config["api_url"],
                headers={
                    "Authorization": f"Bearer {test_config['api_key']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": test_config["model"],
                    "query": body.query,
                    "documents": body.documents,
                    "top_n": len(body.documents),
                },
                timeout=8,
                verify=False,
            )
            resp.raise_for_status()
            data = resp.json()
            latency = int((time.time() - start) * 1000)
            return {
                "success": True,
                "latency_ms": latency,
                "results": data.get("results", []),
                "usage": data.get("meta", {}).get("tokens", data.get("usage", {})),
                "provider_id": provider.get("id", ""),
                "provider_name": provider.get("name", ""),
            }
        except Exception as e:
            return {
                "success": False,
                "latency_ms": 0,
                "error": str(e),
                "provider_id": provider.get("id", ""),
                "provider_name": provider.get("name", ""),
            }

    # 使用默认测试
    result = test_rerank_connection(test_config)
    result["provider_id"] = provider.get("id", "")
    result["provider_name"] = provider.get("name", "")
    return result
