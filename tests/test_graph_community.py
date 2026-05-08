"""图谱社群检测服务 单元测试

测试：prompt 生成、上下文收集逻辑、层级合并算法、JSON 解析
"""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


# ── Prompt 生成测试 ──

class TestCommunityPrompts:
    def test_summary_prompt_contains_entities(self):
        from lumen.prompt.graph_community import community_summary_prompt

        system, user = community_summary_prompt("- 张三\n- 李四", "- 张三认识李四")
        assert "张三" in user
        assert "李四" in user
        assert "张三认识李四" in user
        assert "JSON" in system

    def test_summary_prompt_empty_facts(self):
        from lumen.prompt.graph_community import community_summary_prompt

        system, user = community_summary_prompt("- 张三", "（无边关系）")
        assert "（无边关系）" in user

    def test_merge_prompt_contains_both_summaries(self):
        from lumen.prompt.graph_community import community_merge_prompt

        system, user = community_merge_prompt("社群A摘要", "社群B摘要")
        assert "社群A摘要" in user
        assert "社群B摘要" in user
        assert "JSON" in system

    def test_merge_prompt_output_format(self):
        from lumen.prompt.graph_community import community_merge_prompt

        system, user = community_merge_prompt("a", "b")
        assert "summary" in system


# ── JSON 解析测试 ──

class TestExtractJson:
    def test_valid_json(self):
        from lumen.services.graph.community import _extract_json

        text = '{"name": "武林门派", "summary": "一群武术家"}'
        result = _extract_json(text)
        assert result == {"name": "武林门派", "summary": "一群武术家"}

    def test_json_with_markdown_wrapper(self):
        from lumen.services.graph.community import _extract_json

        text = '```json\n{"name": "门派", "summary": "摘要"}\n```'
        result = _extract_json(text)
        assert result == {"name": "门派", "summary": "摘要"}

    def test_json_with_surrounding_text(self):
        from lumen.services.graph.community import _extract_json

        text = '好的，以下是分析结果：\n{"name": "学校", "summary": "师生关系网"}\n希望对你有帮助。'
        result = _extract_json(text)
        assert result == {"name": "学校", "summary": "师生关系网"}

    def test_trailing_comma_fix(self):
        from lumen.services.graph.community import _extract_json

        text = '{"name": "门派", "summary": "摘要",}'
        result = _extract_json(text)
        assert result == {"name": "门派", "summary": "摘要"}

    def test_empty_input(self):
        from lumen.services.graph.community import _extract_json

        assert _extract_json("") is None
        assert _extract_json(None) is None

    def test_no_json_object(self):
        from lumen.services.graph.community import _extract_json

        assert _extract_json("纯文本没有 JSON") is None


# ── 上下文收集测试 ──

class TestGatherContext:
    def test_basic_context_gathering(self):
        from lumen.services.graph.community import _gather_context

        # Mock db
        db = MagicMock()

        # 模拟两个实体的 payload
        def mock_get_payload(nid):
            payloads = {
                1: {"name": "张三", "type": "entity"},
                2: {"name": "李四", "type": "entity"},
            }
            return payloads.get(nid)

        db.get_payload.side_effect = mock_get_payload

        # 模拟 TQL 返回的边
        mock_row1 = MagicMock()
        mock_row1.row = {
            "_": {
                "id": 10,
                "payload": {
                    "type": "edge",
                    "source_name": "张三",
                    "target_name": "李四",
                    "fact": "张三和李四是同学",
                },
            }
        }
        mock_row2 = MagicMock()
        mock_row2.row = {
            "_": {
                "id": 11,
                "payload": {
                    "type": "edge",
                    "source_name": "张三",
                    "target_name": "王五",  # 不在社群内
                    "fact": "张三认识王五",
                },
            }
        }
        db.tql.return_value = [mock_row1, mock_row2]

        names, facts = _gather_context(db, [1, 2])

        assert "张三" in names
        assert "李四" in names
        assert len(facts) >= 1
        assert any("张三" in f for f in facts)

    def test_empty_entity_ids(self):
        from lumen.services.graph.community import _gather_context

        db = MagicMock()
        names, facts = _gather_context(db, [])
        assert names == []
        assert facts == []

    def test_entities_without_edges(self):
        from lumen.services.graph.community import _gather_context

        db = MagicMock()
        db.get_payload.side_effect = lambda nid: {
            1: {"name": "孤立实体", "type": "entity"},
        }.get(nid)
        db.tql.return_value = []

        names, facts = _gather_context(db, [1])

        assert names == ["孤立实体"]
        assert facts == []


# ── 层级合并测试 ──

class TestHierarchicalReduce:
    @pytest.mark.asyncio
    async def test_single_summary_passthrough(self):
        from lumen.services.graph.community import _hierarchical_reduce

        result = await _hierarchical_reduce(["唯一的摘要"])
        assert result == "唯一的摘要"

    @pytest.mark.asyncio
    async def test_empty_list(self):
        from lumen.services.graph.community import _hierarchical_reduce

        result = await _hierarchical_reduce([])
        assert result == ""

    @pytest.mark.asyncio
    async def test_two_summaries_merged(self):
        from lumen.services.graph.community import _hierarchical_reduce

        with patch(
            "lumen.services.graph.community._llm_merge_pair",
            new_callable=AsyncMock,
            return_value="合并后的摘要",
        ) as mock_merge:
            result = await _hierarchical_reduce(["摘要A", "摘要B"])

            assert result == "合并后的摘要"
            mock_merge.assert_called_once_with("摘要A", "摘要B")

    @pytest.mark.asyncio
    async def test_three_summaries_odd_count(self):
        from lumen.services.graph.community import _hierarchical_reduce

        # 3 个摘要: (A, B) 合并 → M1, C 单独晋升 → M1 和 C 再合并
        call_count = 0

        async def mock_merge(a, b):
            return f"合并({a}+{b})"

        with patch(
            "lumen.services.graph.community._llm_merge_pair",
            new_callable=AsyncMock,
            side_effect=mock_merge,
        ):
            result = await _hierarchical_reduce(["A", "B", "C"])

            # 第一层: 合并(A, B) → "合并(A+B)", C 晋升
            # 第二层: 合并("合并(A+B)", "C") → "合并(合并(A+B)+C)"
            assert result == "合并(合并(A+B)+C)"

    @pytest.mark.asyncio
    async def test_four_summaries_full_tree(self):
        from lumen.services.graph.community import _hierarchical_reduce

        async def mock_merge(a, b):
            return f"M({a},{b})"

        with patch(
            "lumen.services.graph.community._llm_merge_pair",
            new_callable=AsyncMock,
            side_effect=mock_merge,
        ):
            result = await _hierarchical_reduce(["A", "B", "C", "D"])

            # 第一层: M(A,B) + M(C,D)
            # 第二层: M(M(A,B),M(C,D))
            assert result == "M(M(A,B),M(C,D))"


# ── LLM 摘要测试 ──

class TestLlmSummarize:
    @pytest.mark.asyncio
    async def test_successful_summary(self):
        from lumen.services.graph.community import _llm_summarize_community

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "name": "武林门派",
            "summary": "一群武功高强的侠士组成的门派。",
        })

        with patch(
            "lumen.services.graph.community.client"
        ) as mock_client, \
             patch(
            "lumen.services.graph.community.get_model",
            return_value="test-model"
        ):
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

            name, summary = await _llm_summarize_community(
                ["张三", "李四"],
                ["张三和李四是师兄弟"],
            )

            assert name == "武林门派"
            assert "侠士" in summary

    @pytest.mark.asyncio
    async def test_llm_failure_fallback(self):
        from lumen.services.graph.community import _llm_summarize_community

        with patch(
            "lumen.services.graph.community.client"
        ) as mock_client, \
             patch(
            "lumen.services.graph.community.get_model",
            return_value="test-model"
        ):
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("API 不可用")
            )

            name, summary = await _llm_summarize_community(
                ["张三"], []
            )

            assert name == "未命名社群"
            assert "1 个实体" in summary


# ── 存储测试 ──

class TestStoreCommunityNode:
    def test_basic_storage(self):
        from lumen.services.graph.community import _store_community_node

        db = MagicMock()
        db.dim.return_value = 4
        db.insert.return_value = 100

        node_id = _store_community_node(
            db, "测试社群", "测试摘要", [1, 2, 3],
            centroid_vec=[0.1, 0.2, 0.3, 0.4],
        )

        assert node_id == 100
        db.insert.assert_called_once()
        # 验证 payload
        call_args = db.insert.call_args
        vector_arg = call_args[0][0]
        payload_arg = call_args[0][1]
        assert vector_arg == [0.1, 0.2, 0.3, 0.4]
        assert payload_arg["type"] == "community"
        assert payload_arg["name"] == "测试社群"
        assert payload_arg["entity_count"] == 3

        # 验证 BELONGS_TO 链接
        assert db.link.call_count == 3
        db.flush.assert_called()

    def test_storage_without_centroid(self):
        from lumen.services.graph.community import _store_community_node

        db = MagicMock()
        db.dim.return_value = 4
        db.insert.return_value = 101

        node_id = _store_community_node(
            db, "无质心社群", "摘要", [5],
            centroid_vec=None,
        )

        assert node_id == 101
        call_args = db.insert.call_args
        vector_arg = call_args[0][0]
        assert vector_arg == [0.0, 0.0, 0.0, 0.0]  # 零向量回退


# ── Leiden 过滤测试 ──

class TestRunLeiden:
    def test_filter_non_entity_nodes(self):
        """Leiden 结果应只保留 type=entity 的节点"""
        with patch("lumen.services.graph.community._get_tdb") as mock_get_tdb, \
             patch("lumen.services.graph.community.COMMUNITY_LEIDEN_MIN_SIZE", 2):

            db = MagicMock()
            # Leiden 返回混合节点
            db.leiden_cluster.return_value = {
                "communities": [[1, 2, 3], [4, 5, 6]],
                "centroids": {0: [0.1, 0.2], 1: [0.3, 0.4]},
                "num_clusters": 2,
            }

            def mock_get_payload(nid):
                payloads = {
                    1: {"type": "entity", "name": "张三"},
                    2: {"type": "entity", "name": "李四"},
                    3: {"type": "episode", "content": "..."},  # 非实体
                    4: {"type": "entity", "name": "王五"},
                    5: {"type": "edge", "fact": "..."},         # 非实体
                    6: {"type": "entity", "name": "赵六"},
                }
                return payloads.get(nid)

            db.get_payload.side_effect = mock_get_payload
            mock_get_tdb.return_value = db

            result = run_leiden("knowledge")

            # 社群 0: [1, 2] (3 被过滤) → 2 个实体，刚好满足 min_size=2
            # 社群 1: [4, 6] (5 被过滤) → 2 个实体，满足 min_size=2
            assert result["num_clusters"] == 2
            assert len(result["communities"][0]) == 2
            assert len(result["communities"][1]) == 2

    def test_filter_small_communities(self):
        """过滤后不足 min_size 的社群应被移除"""
        with patch("lumen.services.graph.community._get_tdb") as mock_get_tdb, \
             patch("lumen.services.graph.community.COMMUNITY_LEIDEN_MIN_SIZE", 3):

            db = MagicMock()
            db.leiden_cluster.return_value = {
                "communities": [[1, 2, 3], [4, 5]],
                "centroids": {0: [0.1, 0.2], 1: [0.3, 0.4]},
                "num_clusters": 2,
            }

            def mock_get_payload(nid):
                return {"type": "entity", "name": f"实体{nid}"}

            db.get_payload.side_effect = mock_get_payload
            mock_get_tdb.return_value = db

            result = run_leiden("knowledge")

            # 社群 0: 3 个实体 → 保留
            # 社群 1: 2 个实体 < min_size=3 → 移除
            assert result["num_clusters"] == 1
            assert len(result["communities"]) == 1


# ── 需要在模块级别导入 run_leiden ──
from lumen.services.graph.community import run_leiden
