"""
Lumen - 嵌入服务
多后端架构：支持本地 SentenceTransformer、OpenAI 兼容 API、Google Gemini

每个服务（memory/knowledge/thinking_clusters）可独立配置后端和模型。
"""

import logging
import os
import asyncio
from typing import Optional, Protocol, runtime_checkable, Literal

logger = logging.getLogger(__name__)


# ── 后端协议 ──

@runtime_checkable
class EmbeddingBackend(Protocol):
    """嵌入后端协议 — 任何实现此接口的类都可作为嵌入引擎"""
    dimensions: int

    async def encode(self, text: str) -> Optional[list[float]]: ...
    async def encode_batch(self, texts: list[str]) -> Optional[list[list[float]]]: ...


# ── LocalBackend：SentenceTransformer ──

class LocalBackend:
    """本地嵌入后端，使用 SentenceTransformer"""

    def __init__(self, model_name: str):
        self._model_name = model_name
        self._model = None
        self.dimensions = 0

    def _load(self):
        """同步加载模型"""
        if self._model is not None:
            return

        proxy = os.getenv("FETCH_PROXY", "") or os.getenv("SEARCH_PROXY", "") or os.getenv("HTTPS_PROXY", "")
        if proxy:
            os.environ["HTTP_PROXY"] = proxy
            os.environ["HTTPS_PROXY"] = proxy

        from sentence_transformers import SentenceTransformer
        self._model = SentenceTransformer(self._model_name)
        self.dimensions = self._model.get_sentence_embedding_dimension()
        logger.info(f"本地嵌入模型已加载: {self._model_name} (维度: {self.dimensions})")

    async def ensure_loaded(self):
        """异步加载模型（线程安全）"""
        if self._model is not None:
            return
        await asyncio.to_thread(self._load)

    async def encode(self, text: str) -> Optional[list[float]]:
        await self.ensure_loaded()
        if self._model is None:
            return None
        try:
            vector = await asyncio.to_thread(self._model.encode, text, show_progress_bar=False)
            return vector.tolist()
        except Exception as e:
            logger.error(f"本地嵌入编码失败: {e}")
            return None

    async def encode_batch(self, texts: list[str]) -> Optional[list[list[float]]]:
        if not texts:
            return []
        await self.ensure_loaded()
        if self._model is None:
            return None
        try:
            vectors = await asyncio.to_thread(self._model.encode, texts, show_progress_bar=False)
            return vectors.tolist()
        except Exception as e:
            logger.error(f"本地批量嵌入编码失败: {e}")
            return None


# ── OpenAIEmbeddingBackend：OpenAI 兼容 API ──

class OpenAIEmbeddingBackend:
    """OpenAI 兼容嵌入后端，覆盖豆包/智谱/硅基流动/零一万物/阿里等

    多模态模型自动探测：先以标准格式调用，若 API 返回错误码（非 4xx），
    自动切换为 multimodal 格式重试。探测结果在首次调用后缓存。
    """

    def __init__(self, api_url: str, api_key: str, model: str):
        self._api_url = api_url
        self._api_key = api_key
        self._model = model
        self._multimodal: Optional[bool] = None  # None=未探测, True=多模态, False=标准
        self.dimensions = 0  # 从第一次 API 响应中检测
        self._client = None

    def _ensure_client(self):
        if self._client is not None:
            return
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(base_url=self._api_url, api_key=self._api_key)

    async def encode(self, text: str) -> Optional[list[float]]:
        result = await self.encode_batch([text])
        if result:
            return result[0]
        return None

    async def encode_batch(self, texts: list[str]) -> Optional[list[list[float]]]:
        if not texts:
            return []

        # 已知格式 → 直接调用
        if self._multimodal is False:
            return await self._encode_standard(texts)
        if self._multimodal is True:
            return await self._encode_multimodal(texts)

        # 未探测 → 先试标准格式，失败则切换多模态
        vectors = await self._encode_standard(texts)
        if vectors is not None:
            self._multimodal = False
            return vectors

        # 标准格式失败，尝试多模态
        logger.info(f"标准嵌入格式失败，尝试多模态格式 (模型: {self._model})")
        vectors = await self._encode_multimodal(texts)
        if vectors is not None:
            self._multimodal = True
            logger.info(f"多模态嵌入格式已确认 (模型: {self._model})")
            return vectors

        # 两种都失败
        logger.error(f"嵌入编码失败：标准和多模态格式均不可用 (模型: {self._model})")
        return None

    async def _encode_standard(self, texts: list[str]) -> Optional[list[list[float]]]:
        """标准 OpenAI embeddings API 格式"""
        self._ensure_client()
        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=texts,
            )
            vectors = [item.embedding for item in response.data]
            if self.dimensions == 0 and vectors:
                self.dimensions = len(vectors[0])
                logger.info(f"API 嵌入维度已检测: {self.dimensions} (模型: {self._model})")
            return vectors
        except Exception as e:
            logger.warning(f"标准嵌入格式调用失败: {e}")
            return None

    async def _encode_multimodal(self, texts: list[str]) -> Optional[list[list[float]]]:
        """多模态 embeddings API 格式（raw HTTP）

        多模态端点将所有 input 合为一个嵌入，所以逐条调用。
        格式: POST {api_url}/embeddings/multimodal
        Body: {"model":"...", "input":[{"type":"text","text":"..."}]}
        响应: {"data":{"embedding":[...]}}（单个对象，非列表）
        """
        import aiohttp

        base = self._api_url.rstrip("/")
        url = f"{base}/embeddings/multimodal"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        vectors = []
        try:
            async with aiohttp.ClientSession() as session:
                for text in texts:
                    async with session.post(
                        url,
                        json={"model": self._model, "input": [{"type": "text", "text": text}]},
                        headers=headers,
                    ) as resp:
                        if resp.status != 200:
                            body = await resp.text()
                            logger.warning(f"多模态嵌入 API 错误 ({resp.status}): {body[:300]}")
                            return None
                        data = await resp.json()

                    # 响应格式: {"data": {"embedding": [...]}}
                    embedding = None
                    if isinstance(data.get("data"), dict):
                        embedding = data["data"].get("embedding")
                    elif isinstance(data.get("data"), list) and data["data"]:
                        embedding = data["data"][0].get("embedding")

                    if not embedding:
                        logger.warning(f"多模态嵌入响应缺少 embedding: {str(data)[:200]}")
                        return None

                    vectors.append(embedding)

            if self.dimensions == 0 and vectors:
                self.dimensions = len(vectors[0])
                logger.info(f"多模态嵌入维度已检测: {self.dimensions} (模型: {self._model})")

            return vectors
        except Exception as e:
            logger.warning(f"多模态嵌入编码失败: {e}")
            return None

    # ── 稀疏向量支持（doubao-embedding-vision 250615+）──

    InstructionType = Literal["query", "document", None]

    async def encode_with_sparse(
        self, text: str, instruction_type: "OpenAIEmbeddingBackend.InstructionType" = None
    ) -> Optional[tuple[list[float], list[dict] | dict]]:
        """编码单条文本，同时返回稠密+稀疏向量"""
        result = await self.encode_batch_with_sparse([text], instruction_type=instruction_type)
        if result:
            return result[0]
        return None

    async def encode_batch_with_sparse(
        self, texts: list[str], instruction_type: "OpenAIEmbeddingBackend.InstructionType" = None
    ) -> Optional[list[tuple[list[float], list[dict] | dict]]]:
        """批量编码，同时返回稠密+稀疏向量 [(dense, sparse), ...]

        通过 multimodal 端点 + sparse_embedding: enabled 实现。
        instruction_type 预留参数，本期底层不拼接。
        """
        import aiohttp

        base = self._api_url.rstrip("/")
        url = f"{base}/embeddings/multimodal"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        results = []
        try:
            async with aiohttp.ClientSession() as session:
                for text in texts:
                    body = {
                        "model": self._model,
                        "input": [{"type": "text", "text": text}],
                        "sparse_embedding": {"type": "enabled"},
                        "encoding_format": "float",
                    }

                    async with session.post(url, json=body, headers=headers) as resp:
                        if resp.status != 200:
                            body_text = await resp.text()
                            logger.warning(f"稀疏嵌入 API 错误 ({resp.status}): {body_text[:300]}")
                            return None
                        data = await resp.json()

                    # 提取稠密向量
                    embedding = None
                    data_obj = data.get("data")
                    if isinstance(data_obj, dict):
                        embedding = data_obj.get("embedding")
                        sparse = data_obj.get("sparse_embedding")
                    elif isinstance(data_obj, list) and data_obj:
                        embedding = data_obj[0].get("embedding")
                        sparse = data_obj[0].get("sparse_embedding")
                    else:
                        logger.warning(f"稀疏嵌入响应格式异常: {str(data)[:200]}")
                        return None

                    if not embedding:
                        logger.warning(f"稀疏嵌入响应缺少 embedding: {str(data)[:200]}")
                        return None

                    if self.dimensions == 0:
                        self.dimensions = len(embedding)

                    results.append((embedding, sparse))

            return results
        except Exception as e:
            logger.warning(f"稀疏嵌入编码失败: {e}")
            return None


# ── GeminiEmbeddingBackend：Google Gemini ──

class GeminiEmbeddingBackend:
    """Google Gemini 嵌入后端"""

    def __init__(self, api_key: str, model: str = "gemini-embedding-exp-03-07"):
        self._api_key = api_key
        self._model = model
        self.dimensions = 0

    async def encode(self, text: str) -> Optional[list[float]]:
        result = await self.encode_batch([text])
        if result:
            return result[0]
        return None

    async def encode_batch(self, texts: list[str]) -> Optional[list[list[float]]]:
        if not texts:
            return []
        import aiohttp

        results = []
        async with aiohttp.ClientSession() as session:
            for text in texts:
                try:
                    url = (
                        f"https://generativelanguage.googleapis.com/v1beta/"
                        f"models/{self._model}:embedContent?key={self._api_key}"
                    )
                    payload = {"model": f"models/{self._model}", "content": {"parts": [{"text": text}]}}

                    async with session.post(url, json=payload) as resp:
                        data = await resp.json()

                    if "embedding" in data and "values" in data["embedding"]:
                        vector = data["embedding"]["values"]
                        results.append(vector)

                        if self.dimensions == 0:
                            self.dimensions = len(vector)
                            logger.info(f"Gemini 嵌入维度已检测: {self.dimensions} (模型: {self._model})")
                    else:
                        logger.warning(f"Gemini 嵌入响应异常，跳过: {data}")
                        continue
                except Exception as e:
                    logger.warning(f"Gemini 嵌入编码失败，跳过: {e}")
                    continue

        return results if results else None


# ── EmbeddingService：多服务管理器 ──

def _build_backend(backend_type: str, model_name: str, api_url: str, api_key: str, api_model: str) -> Optional[EmbeddingBackend]:
    """根据配置创建嵌入后端实例"""
    if backend_type == "local":
        return LocalBackend(model_name)
    elif backend_type == "openai":
        if not api_url or not api_key or not api_model:
            logger.error("OpenAI 嵌入后端缺少 EMBEDDING_API_URL / EMBEDDING_API_KEY / EMBEDDING_API_MODEL")
            return None
        return OpenAIEmbeddingBackend(api_url, api_key, api_model)
    elif backend_type == "gemini":
        if not api_key or not api_model:
            logger.error("Gemini 嵌入后端缺少 EMBEDDING_API_KEY / EMBEDDING_API_MODEL")
            return None
        return GeminiEmbeddingBackend(api_key, api_model)
    else:
        logger.error(f"未知嵌入后端类型: {backend_type}")
        return None


def _resolve_service_config(service_name: str) -> dict:
    """解析指定服务的嵌入配置（两阵营架构）

    阵营 A（本地小模型）：memory / thinking_clusters / knowledge_sentences
    阵营 B（API 大模型）：knowledge + agent_knowledge + 所有用户新建知识库

    Returns:
        {"backend_type", "model_name", "api_url", "api_key", "api_model"}
        backend_type 为空字符串表示该服务不启用
    """
    from lumen.config import (
        EMBEDDING_LOCAL_MODEL, EMBEDDING_API_URL,
        EMBEDDING_API_KEY, EMBEDDING_API_MODEL,
        KNOWLEDGE_EMBEDDING_BACKEND,
    )

    # ── 阵营 B：知识库（API 大模型）──
    if service_name in ("knowledge", "agent_knowledge"):
        if not KNOWLEDGE_EMBEDDING_BACKEND:
            return {"backend_type": "", "model_name": "",
                    "api_url": EMBEDDING_API_URL, "api_key": EMBEDDING_API_KEY,
                    "api_model": EMBEDDING_API_MODEL}
        return {
            "backend_type": KNOWLEDGE_EMBEDDING_BACKEND,
            "model_name": "",
            "api_url": EMBEDDING_API_URL,
            "api_key": EMBEDDING_API_KEY,
            "api_model": EMBEDDING_API_MODEL,
        }

    # ── 阵营 A：所有内部模块（本地小模型）──
    return {
        "backend_type": "local",
        "model_name": EMBEDDING_LOCAL_MODEL,
        "api_url": "",
        "api_key": "",
        "api_model": "",
    }


# 服务实例缓存：{service_name: EmbeddingBackend}
_services: dict[str, EmbeddingBackend] = {}
_services_lock = asyncio.Lock()


async def get_service(service_name: str) -> Optional[EmbeddingBackend]:
    """获取指定服务的嵌入后端实例

    Args:
        service_name: "memory" | "knowledge" | "thinking_clusters"

    Returns:
        嵌入后端实例，配置错误或嵌入禁用时返回 None
    """
    from lumen.config import EMBEDDING_ENABLED
    if not EMBEDDING_ENABLED:
        return None

    if service_name in _services:
        return _services[service_name]

    async with _services_lock:
        # 双重检查
        if service_name in _services:
            return _services[service_name]

        config = _resolve_service_config(service_name)

        # 空后端类型 = 该服务不启用
        if not config["backend_type"]:
            logger.info(f"嵌入服务 '{service_name}' 未配置后端，跳过初始化")
            return None

        backend = _build_backend(
            config["backend_type"],
            config["model_name"],
            config["api_url"],
            config["api_key"],
            config["api_model"],
        )

        if backend is None:
            return None

        # 预加载（LocalBackend 需要加载模型）
        if isinstance(backend, LocalBackend):
            await backend.ensure_loaded()

        _services[service_name] = backend
        logger.info(f"嵌入服务 '{service_name}' 已初始化: {config['backend_type']} (模型: {config.get('model_name') or config.get('api_model')})")
        return backend


def get_dimensions(service_name: str = "memory") -> int:
    """获取指定服务的嵌入维度（需要先调用 get_service 初始化）"""
    backend = _services.get(service_name)
    if backend:
        return backend.dimensions
    return 0


def resolve_dimensions(service_name: str) -> int:
    """获取指定服务的向量维度 — 两阵营，从配置读，不猜测

    阵营 A（本地小模型）：读 EMBEDDING_LOCAL_DIM，默认 512
    阵营 B（API 大模型）：读 EMBEDDING_API_DIM，必须配置
    要换维度：改 .env → 删 .tdb 文件 → 重启
    """
    from lumen.config import EMBEDDING_LOCAL_DIM, EMBEDDING_API_DIM

    # 阵营 B：知识库必须用户显式配置
    if service_name in ("knowledge", "agent_knowledge"):
        if EMBEDDING_API_DIM > 0:
            return EMBEDDING_API_DIM
        raise ValueError(
            "知识库维度未配置。请在 .env 中设置 EMBEDDING_API_DIM=xxx，"
            "然后删除 knowledge.tdb 重启"
        )

    # 阵营 A：所有内部模块，读本地模型维度
    return EMBEDDING_LOCAL_DIM


def _save_dim_file(db_path: str, dim: int):
    """保存维度到 .dim 文件（纯记录，不参与维度决策）"""
    try:
        with open(db_path + ".dim", "w") as f:
            f.write(str(dim))
    except Exception:
        pass


def check_dim_consistency(db_path: str, dim: int) -> str | None:
    """检查 .dim 文件与当前配置是否一致

    Returns: None 表示一致，否则返回错误信息
    """
    dim_file = db_path + ".dim"
    if not os.path.exists(dim_file) or not os.path.exists(db_path):
        return None
    try:
        saved = int(open(dim_file).read().strip())
        if saved != dim:
            return (
                f"维度不匹配：数据库 {db_path} 创建时维度={saved}，"
                f"当前配置维度={dim}。"
                f"请删除 {db_path} 和 {dim_file} 后重启重建"
            )
    except Exception:
        pass
    return None


# ── 向后兼容的公共 API ──
# 旧代码直接调用 encode() / encode_batch() / is_available()，不传服务名
# 默认使用 "memory" 服务的后端

async def ensure_loaded():
    """确保默认服务已加载（向后兼容）"""
    await get_service("memory")


def is_available() -> bool:
    """检查默认嵌入服务是否可用（向后兼容）"""
    backend = _services.get("memory")
    if isinstance(backend, LocalBackend):
        return backend._model is not None
    return backend is not None


async def encode(text: str) -> Optional[list[float]]:
    """编码单条文本（向后兼容，使用 memory 服务）"""
    backend = await get_service("memory")
    if backend is None:
        return None
    return await backend.encode(text)


async def encode_batch(texts: list[str]) -> Optional[list[list[float]]]:
    """编码多条文本（向后兼容，使用 memory 服务）"""
    if not texts:
        return []
    backend = await get_service("memory")
    if backend is None:
        return None
    return await backend.encode_batch(texts)
