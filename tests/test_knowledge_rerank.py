"""
Lumen - Cross-Encoder Rerank 服务单元测试

覆盖：运行时配置优先级、rerank 主流程、超时/错误回退、文档截断、连通性测试。
所有外部 API 调用均 mock，不依赖网络。
"""

import asyncio
import json
import pytest
from unittest.mock import patch, MagicMock

# ── 运行时配置测试 ──


class TestGetActiveProvider:
    """get_active_provider() 优先级测试"""

    def setup_method(self):
        """每个测试前清除 rerank 模块的运行时缓存"""
        import lumen.services.knowledge.rerank as rerank_mod
        rerank_mod._runtime_config = None

    def test_returns_none_when_disabled(self):
        """KNOWLEDGE_RERANK_ENABLED=False 时直接返回 None"""
        import lumen.services.knowledge.rerank as rerank_mod
        with patch.object(rerank_mod, "KNOWLEDGE_RERANK_ENABLED", False):
            assert rerank_mod.get_active_provider() is None

    def test_json_config_highest_priority(self, tmp_path):
        """JSON 配置文件优先于 .env 环境变量"""
        import lumen.services.knowledge.rerank as rerank_mod

        config_data = {
            "active_provider": "test",
            "providers": [{
                "id": "test",
                "name": "TestProvider",
                "api_url": "https://test.example.com/rerank",
                "api_key": "test-key-123",
                "model": "test-model",
            }]
        }
        config_file = tmp_path / "rerank_providers.json"
        config_file.write_text(json.dumps(config_data), encoding="utf-8")

        with (
            patch.object(rerank_mod, "KNOWLEDGE_RERANK_ENABLED", True),
            patch.object(rerank_mod, "_CONFIG_PATH", config_file),
            patch.object(rerank_mod, "SILICONFLOW_API_KEY", "should-not-be-used"),
            patch.object(rerank_mod, "ZHIPU_API_KEY", "should-not-be-used"),
        ):
            rerank_mod.reload_rerank_config()  # 清除缓存
            result = rerank_mod.get_active_provider()
            assert result is not None
            assert result["name"] == "TestProvider"
            assert result["api_key"] == "test-key-123"

    def test_siliconflow_env_fallback(self):
        """JSON 不存在时，回退到 SILICONFLOW_API_KEY"""
        import lumen.services.knowledge.rerank as rerank_mod

        with (
            patch.object(rerank_mod, "KNOWLEDGE_RERANK_ENABLED", True),
            patch.object(rerank_mod, "_CONFIG_PATH", tmp_path_factory()),
            patch.object(rerank_mod, "SILICONFLOW_API_KEY", "sf-key-456"),
            patch.object(rerank_mod, "ZHIPU_API_KEY", "zp-key-789"),
        ):
            result = rerank_mod.get_active_provider()
            assert result is not None
            assert "SiliconFlow" in result["name"]
            assert result["api_key"] == "sf-key-456"

    def test_zhipu_env_fallback(self):
        """SILICONFLOW_API_KEY 为空时，回退到 ZHIPU_API_KEY"""
        import lumen.services.knowledge.rerank as rerank_mod

        with (
            patch.object(rerank_mod, "KNOWLEDGE_RERANK_ENABLED", True),
            patch.object(rerank_mod, "_CONFIG_PATH", tmp_path_factory()),
            patch.object(rerank_mod, "SILICONFLOW_API_KEY", ""),
            patch.object(rerank_mod, "ZHIPU_API_KEY", "zp-key-789"),
        ):
            result = rerank_mod.get_active_provider()
            assert result is not None
            assert "Zhipu" in result["name"]
            assert result["api_key"] == "zp-key-789"

    def test_returns_none_when_nothing_configured(self):
        """所有配置源都空时返回 None"""
        import lumen.services.knowledge.rerank as rerank_mod

        with (
            patch.object(rerank_mod, "KNOWLEDGE_RERANK_ENABLED", True),
            patch.object(rerank_mod, "_CONFIG_PATH", tmp_path_factory()),
            patch.object(rerank_mod, "SILICONFLOW_API_KEY", ""),
            patch.object(rerank_mod, "ZHIPU_API_KEY", ""),
        ):
            assert rerank_mod.get_active_provider() is None

    def test_inactive_provider_skipped(self, tmp_path):
        """JSON 中 active=false 的服务商被跳过"""
        import lumen.services.knowledge.rerank as rerank_mod

        config_data = {
            "providers": [{
                "name": "InactiveProvider",
                "api_url": "https://test.example.com/rerank",
                "api_key": "test-key",
                "model": "test-model",
                "active": False,
            }]
        }
        config_file = tmp_path / "rerank_providers.json"
        config_file.write_text(json.dumps(config_data), encoding="utf-8")

        with (
            patch.object(rerank_mod, "KNOWLEDGE_RERANK_ENABLED", True),
            patch.object(rerank_mod, "_CONFIG_PATH", config_file),
            patch.object(rerank_mod, "SILICONFLOW_API_KEY", ""),
            patch.object(rerank_mod, "ZHIPU_API_KEY", ""),
        ):
            assert rerank_mod.get_active_provider() is None

    def test_reload_clears_cache(self, tmp_path):
        """reload_rerank_config() 清除缓存后重新读取"""
        import lumen.services.knowledge.rerank as rerank_mod

        # 先设缓存
        rerank_mod._runtime_config = {"name": "cached"}
        rerank_mod.reload_rerank_config()
        assert rerank_mod._runtime_config is None


def tmp_path_factory():
    """返回一个不存在的 Path，模拟无 JSON 配置文件"""
    from pathlib import Path
    return Path("/nonexistent/path/rerank_providers.json")


# ── Rerank 主流程测试 ──


class TestRerankKnowledgeResults:
    """rerank_knowledge_results() 测试"""

    @pytest.mark.asyncio
    async def test_successful_rerank(self):
        """正常 rerank 返回重排序结果"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "name": "Test",
            "api_url": "https://test.example.com/rerank",
            "api_key": "test-key",
            "model": "test-model",
            "top_k": 5,
            "min_score": 0.3,
            "max_doc_chars": 0,
        }

        mock_results = [
            {"content": "文档A关于人工智能"},
            {"content": "文档B关于天气"},
            {"content": "文档C关于机器学习"},
        ]

        api_response = {
            "results": [
                {"index": 2, "relevance_score": 0.95},
                {"index": 0, "relevance_score": 0.80},
            ]
        }

        with (
            patch.object(rerank_mod, "get_active_provider", return_value=provider),
            patch.object(rerank_mod, "_call_rerank_api", return_value=api_response),
        ):
            result = await rerank_mod.rerank_knowledge_results("人工智能", mock_results)

            assert len(result) == 2
            assert result[0]["content"] == "文档C关于机器学习"
            assert result[0]["rerank_score"] == 0.95
            assert result[1]["content"] == "文档A关于人工智能"
            assert result[1]["rerank_score"] == 0.80

    @pytest.mark.asyncio
    async def test_returns_original_when_disabled(self):
        """Rerank 未启用时原样返回"""
        import lumen.services.knowledge.rerank as rerank_mod

        results = [{"content": "test"}]
        with patch.object(rerank_mod, "get_active_provider", return_value=None):
            out = await rerank_mod.rerank_knowledge_results("query", results)
            assert out is results

    @pytest.mark.asyncio
    async def test_returns_original_on_empty(self):
        """空结果直接返回"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {"name": "Test", "api_key": "k", "api_url": "u", "model": "m"}
        with patch.object(rerank_mod, "get_active_provider", return_value=provider):
            out = await rerank_mod.rerank_knowledge_results("query", [])
            assert out == []

    @pytest.mark.asyncio
    async def test_timeout_fallback(self):
        """超时时回退原始排序（截断到 top_k）"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "name": "Test",
            "api_url": "https://test.example.com/rerank",
            "api_key": "test-key",
            "model": "test-model",
            "top_k": 2,
            "min_score": 0.3,
        }

        results = [
            {"content": "A"},
            {"content": "B"},
            {"content": "C"},
        ]

        async def slow_rerank(*args, **kwargs):
            await asyncio.sleep(20)  # 超过 10s 超时

        with (
            patch.object(rerank_mod, "get_active_provider", return_value=provider),
            patch.object(rerank_mod, "_do_rerank", side_effect=slow_rerank),
        ):
            out = await rerank_mod.rerank_knowledge_results("query", results)
            assert len(out) == 2
            assert out[0]["content"] == "A"
            assert out[1]["content"] == "B"

    @pytest.mark.asyncio
    async def test_error_fallback(self):
        """API 异常时回退原始排序"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "name": "Test",
            "api_url": "https://test.example.com/rerank",
            "api_key": "test-key",
            "model": "test-model",
            "top_k": 3,
            "min_score": 0.3,
        }

        results = [{"content": "A"}, {"content": "B"}]

        with (
            patch.object(rerank_mod, "get_active_provider", return_value=provider),
            patch.object(rerank_mod, "_do_rerank", side_effect=ConnectionError("network down")),
        ):
            out = await rerank_mod.rerank_knowledge_results("query", results)
            assert out == results[:3]  # top_k=3 > len(results)，所以全返回

    @pytest.mark.asyncio
    async def test_max_doc_chars_truncation(self):
        """max_doc_chars 限制发送给 API 的文档长度"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "name": "Test",
            "api_url": "https://test.example.com/rerank",
            "api_key": "test-key",
            "model": "test-model",
            "top_k": 10,
            "min_score": 0.0,
            "max_doc_chars": 10,
        }

        results = [
            {"content": "A" * 100},  # 会被截断为前 10 字符
            {"content": "B" * 100},
        ]

        api_response = {
            "results": [
                {"index": 0, "relevance_score": 0.9},
                {"index": 1, "relevance_score": 0.8},
            ]
        }

        captured_documents = []

        def capture_api_call(prov, query, documents, top_n):
            captured_documents.extend(documents)
            return api_response

        with (
            patch.object(rerank_mod, "get_active_provider", return_value=provider),
            patch.object(rerank_mod, "_call_rerank_api", side_effect=capture_api_call),
        ):
            await rerank_mod.rerank_knowledge_results("query", results)
            assert len(captured_documents) == 2
            assert len(captured_documents[0]) == 10
            assert len(captured_documents[1]) == 10

    @pytest.mark.asyncio
    async def test_min_score_filter(self):
        """低于 min_score 的结果被过滤，回退原始排序"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "name": "Test",
            "api_url": "https://test.example.com/rerank",
            "api_key": "test-key",
            "model": "test-model",
            "top_k": 5,
            "min_score": 0.8,
        }

        results = [
            {"content": "A"},
            {"content": "B"},
        ]

        # 所有分数都低于 0.8 阈值
        api_response = {
            "results": [
                {"index": 0, "relevance_score": 0.5},
                {"index": 1, "relevance_score": 0.3},
            ]
        }

        with (
            patch.object(rerank_mod, "get_active_provider", return_value=provider),
            patch.object(rerank_mod, "_call_rerank_api", return_value=api_response),
        ):
            out = await rerank_mod.rerank_knowledge_results("query", results)
            # 全被过滤，回退原始 top_k
            assert len(out) == 2


# ── 连通性测试 ──


class TestRerankConnection:
    """test_rerank_connection() 测试"""

    def test_success(self):
        """连通性测试成功"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "api_url": "https://test.example.com/rerank",
            "api_key": "test-key",
            "model": "test-model",
        }

        api_response = {
            "results": [
                {"index": 0, "relevance_score": 0.95},
                {"index": 1, "relevance_score": 0.2},
            ],
            "meta": {"tokens": {"input_tokens": 50, "output_tokens": 10}},
        }

        with patch.object(rerank_mod, "_call_rerank_api", return_value=api_response):
            result = rerank_mod.test_rerank_connection(provider)

        assert result["success"] is True
        assert result["latency_ms"] >= 0
        assert len(result["results"]) == 2
        assert result["usage"]["input_tokens"] == 50

    def test_failure(self):
        """连通性测试失败"""
        import lumen.services.knowledge.rerank as rerank_mod

        provider = {
            "api_url": "https://test.example.com/rerank",
            "api_key": "bad-key",
            "model": "test-model",
        }

        with patch.object(rerank_mod, "_call_rerank_api", side_effect=ConnectionError("refused")):
            result = rerank_mod.test_rerank_connection(provider)

        assert result["success"] is False
        assert result["latency_ms"] == 0
        assert "refused" in result["error"]
