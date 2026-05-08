"""图谱去重 + 矛盾检测 单元测试"""
import pytest
from unittest.mock import AsyncMock, patch
from lumen.services.graph.dedup import EntityIndex


class TestEntityIndexExactMatch:
    def test_exact_match_main_name(self):
        idx = EntityIndex()
        idx.add(1, "张三")
        assert idx.find_exact("张三") == 1
        assert idx.find_exact("李四") is None

    def test_exact_match_via_alias(self):
        idx = EntityIndex()
        idx.add(1, "陈明", aliases=["外卖员小陈", "小陈"])
        assert idx.find_exact("陈明") == 1
        assert idx.find_exact("外卖员小陈") == 1
        assert idx.find_exact("小陈") == 1

    def test_remove_entity(self):
        idx = EntityIndex()
        idx.add(1, "张三", aliases=["小张"])
        assert idx.find_exact("张三") == 1
        assert idx.find_exact("小张") == 1

        idx.remove(1)
        assert idx.find_exact("张三") is None
        assert idx.find_exact("小张") is None

    def test_multiple_entities(self):
        idx = EntityIndex()
        idx.add(1, "张三", aliases=["老张"])
        idx.add(2, "张三丰", aliases=["太极张三丰"])
        assert idx.find_exact("张三") == 1
        assert idx.find_exact("张三丰") == 2
        assert idx.find_exact("老张") == 1
        assert idx.find_exact("太极张三丰") == 2


class TestDedupEntities:
    @pytest.mark.asyncio
    async def test_exact_match_resolved(self):
        """Phase 1 精确匹配命中"""
        from lumen.services.graph.dedup import dedup_entities

        idx = EntityIndex()
        idx.add(1, "张三")

        entities = [{"name": "张三", "type": "Character", "_vector": [0.1] * 512}]
        result = await dedup_entities(entities, idx)

        assert result[0]["_resolved"] is True
        assert result[0]["_existing_id"] == 1

    @pytest.mark.asyncio
    async def test_no_match_new_entity(self):
        """无匹配 → 新实体"""
        from lumen.services.graph.dedup import dedup_entities

        idx = EntityIndex()
        entities = [{"name": "新人物", "type": "Character", "_vector": [0.1] * 512}]

        with patch("lumen.services.graph.dedup._vector_top_k_search",
                   return_value=[]):
            result = await dedup_entities(entities, idx)

        assert result[0]["_resolved"] is False

    @pytest.mark.asyncio
    async def test_floor_score_early_exit(self):
        """地板分早退：最高分 < 0.3 → 直接创建新实体，不调 LLM"""
        from lumen.services.graph.dedup import dedup_entities

        idx = EntityIndex()
        entities = [{"name": "火星殖民地", "type": "Location", "_vector": [0.1] * 512}]

        mock_hits = [{"id": 10, "name": "少林寺", "type": "Location", "score": 0.12}]
        with patch("lumen.services.graph.dedup._vector_top_k_search",
                   return_value=mock_hits):
            result = await dedup_entities(entities, idx)

        assert result[0]["_resolved"] is False

    @pytest.mark.asyncio
    async def test_vector_hits_trigger_llm(self):
        """Top-K 有合格候选 → Phase 3 LLM 裁决"""
        from lumen.services.graph.dedup import dedup_entities

        idx = EntityIndex()
        entities = [{"name": "北大", "type": "Organization", "_vector": [0.1] * 512}]

        mock_hits = [
            {"id": 10, "name": "北京大学", "type": "Organization", "score": 0.85},
            {"id": 11, "name": "北大荒", "type": "Organization", "score": 0.69},
        ]
        with patch("lumen.services.graph.dedup._vector_top_k_search",
                   return_value=mock_hits), \
             patch("lumen.services.graph.dedup._llm_resolve_entities",
                   new_callable=AsyncMock) as mock_llm:
            await dedup_entities(entities, idx)

        mock_llm.assert_called_once()


class TestEdgeContradiction:
    def test_find_exact_edge_duplicate(self):
        """精确去重：fact 归一化后相同"""
        from lumen.services.graph.dedup import _find_exact_edge_duplicate

        existing = [
            {"id": 1, "payload": {"fact": "张三住在 北京"}},
            {"id": 2, "payload": {"fact": "李四住在 上海"}},
        ]
        result = _find_exact_edge_duplicate(existing, "张三住在北京")
        assert result is not None
        assert result["id"] == 1

    def test_no_exact_duplicate(self):
        from lumen.services.graph.dedup import _find_exact_edge_duplicate

        existing = [{"id": 1, "payload": {"fact": "张三住在北京"}}]
        result = _find_exact_edge_duplicate(existing, "张三搬到了上海")
        assert result is None
