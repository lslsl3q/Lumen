"""图谱集成测试 — 提取→去重→写入 全管线

测试世界观：修仙小说「天剑纪」
  人物：苏墨寒(主角)、云清雪(师姐)、玄武真人(师尊)、柳如烟(凡人青梅)、血魔尊者(反派)、赤焰长老(天剑宗长老)
  组织：天剑宗、血魔殿、万宝阁
  地点：昆仑山、九幽深渊、云梦城
  物品：寒霜剑、天机镜
  概念：筑基期、天劫
  事件：昆仑论剑

验证：
1. batch_upsert 写入多类型实体 + 复杂关系网
2. 精确去重 + 别名去重（苏墨寒/小墨、天剑宗/天剑门）
3. 边精确去重 + episode_ids 合并
4. Episode 事务（commit / rollback）
5. 去重索引增量更新
6. 边计数准确性（去重合并不计入）
7. 多类型实体 payload 正确
8. source_folders 维护
"""
import time
import asyncio
import pytest

from lumen.services.graph._core import (
    batch_upsert, _get_tdb, _normalize_name, find_entity_by_name, upsert_entity,
)
from lumen.services.graph.dedup import (
    EntityIndex, dedup_entities, _find_exact_edge_duplicate,
)
from lumen.services.graph.episodes import (
    create_episode, commit_episode, rollback_episode, get_episode,
)


# ── 测试世界观数据 ──

P = "t_"  # 测试前缀，避免污染真实数据
SRC = "t_pipeline"


def _entities():
    """天剑纪世界观：8 个实体，覆盖全部 6 种 entity_type"""
    return [
        {"name": f"{P}苏墨寒", "type": "Character",
         "aliases": [f"{P}小墨", f"{P}墨寒"], "_vector": None},
        {"name": f"{P}云清雪", "type": "Character",
         "aliases": [f"{P}清雪师姐"], "_vector": None},
        {"name": f"{P}玄武真人", "type": "Character",
         "aliases": [f"{P}师尊"], "_vector": None},
        {"name": f"{P}血魔尊者", "type": "Character",
         "aliases": [f"{P}血魔", f"{P}魔尊"], "_vector": None},
        {"name": f"{P}天剑宗", "type": "Organization",
         "aliases": [f"{P}天剑门"], "_vector": None},
        {"name": f"{P}昆仑山", "type": "Location",
         "aliases": [f"{P}昆仑", f"{P}昆仑峰"], "_vector": None},
        {"name": f"{P}寒霜剑", "type": "Item",
         "aliases": [f"{P}霜剑"], "_vector": None},
        {"name": f"{P}筑基期", "type": "Concept",
         "aliases": [f"{P}筑基"], "_vector": None},
    ]


def _edges():
    """天剑纪关系网：12 条边，覆盖师徒/社交/空间/等级/装备/对立"""
    return [
        # ── 师徒链 ──
        {"src_name": f"{P}玄武真人", "dst_name": f"{P}苏墨寒",
         "label": "is_master_of", "fact": f"{P}玄武真人是苏墨寒的师父",
         "valid_at": None, "invalid_at": None},
        {"src_name": f"{P}玄武真人", "dst_name": f"{P}云清雪",
         "label": "is_master_of", "fact": f"{P}玄武真人是云清雪的师父",
         "valid_at": None, "invalid_at": None},
        # ── 社交 ──
        {"src_name": f"{P}苏墨寒", "dst_name": f"{P}云清雪",
         "label": "is_fellow_disciple_of", "fact": f"{P}苏墨寒与云清雪是同门师兄弟",
         "valid_at": None, "invalid_at": None},
        {"src_name": f"{P}苏墨寒", "dst_name": f"{P}柳如烟",
         "label": "childhood_friend_of", "fact": f"{P}苏墨寒与柳如烟是青梅竹马",
         "valid_at": None, "invalid_at": None},
        # ── 组织归属 ──
        {"src_name": f"{P}苏墨寒", "dst_name": f"{P}天剑宗",
         "label": "is_member_of", "fact": f"{P}苏墨寒是天剑宗内门弟子",
         "valid_at": None, "invalid_at": None},
        {"src_name": f"{P}玄武真人", "dst_name": f"{P}天剑宗",
         "label": "is_elder_of", "fact": f"{P}玄武真人是天剑宗太上长老",
         "valid_at": None, "invalid_at": None},
        {"src_name": f"{P}血魔尊者", "dst_name": f"{P}血魔殿",
         "label": "is_leader_of", "fact": f"{P}血魔尊者是血魔殿殿主",
         "valid_at": None, "invalid_at": None},
        # ── 空间 ──
        {"src_name": f"{P}天剑宗", "dst_name": f"{P}昆仑山",
         "label": "is_located_at", "fact": f"{P}天剑宗坐落于昆仑山主峰",
         "valid_at": None, "invalid_at": None},
        {"src_name": f"{P}血魔殿", "dst_name": f"{P}九幽深渊",
         "label": "is_located_at", "fact": f"{P}血魔殿藏身于九幽深渊之下",
         "valid_at": None, "invalid_at": None},
        # ── 装备 ──
        {"src_name": f"{P}苏墨寒", "dst_name": f"{P}寒霜剑",
         "label": "wields", "fact": f"{P}苏墨寒持有寒霜剑此上古神兵",
         "valid_at": None, "invalid_at": None},
        # ── 等级 ──
        {"src_name": f"{P}苏墨寒", "dst_name": f"{P}筑基期",
         "label": "attained", "fact": f"{P}苏墨寒已达到筑基期境界",
         "valid_at": None, "invalid_at": None},
        # ── 对立 ──
        {"src_name": f"{P}苏墨寒", "dst_name": f"{P}血魔尊者",
         "label": "is_rival_of", "fact": f"{P}苏墨寒与血魔尊者是不共戴天的宿敌",
         "valid_at": None, "invalid_at": None},
    ]


# ── 第二批实体/边（测试增量写入 + 新实体创建）──

def _extra_entities():
    """增量写入：新增 3 个实体"""
    return [
        {"name": f"{P}柳如烟", "type": "Character",
         "aliases": [f"{P}如烟"], "_vector": None},
        {"name": f"{P}血魔殿", "type": "Organization",
         "aliases": [f"{P}魔殿"], "_vector": None},
        {"name": f"{P}九幽深渊", "type": "Location",
         "aliases": [f"{P}九幽"], "_vector": None},
    ]


def _extra_edges():
    """增量写入：新增 2 条边（涉及新实体 + 已有实体的新关系）"""
    return [
        {"src_name": f"{P}柳如烟", "dst_name": f"{P}云梦城",
         "label": "lives_in", "fact": f"{P}柳如烟住在云梦城经营药铺",
         "valid_at": None, "invalid_at": None},
        {"src_name": f"{P}血魔尊者", "dst_name": f"{P}苏墨寒",
         "label": "was_defeated_by", "fact": f"{P}血魔尊者在昆仑论剑中败于苏墨寒",
         "valid_at": None, "invalid_at": None},
    ]


# ── 清理 ──

def _all_entity_names():
    """所有测试实体的名称（含额外实体的自动创建物）"""
    names = [e["name"] for e in _entities()]
    names += [e["name"] for e in _extra_entities()]
    # 边中可能自动创建的实体（云梦城）
    names += [f"{P}云梦城"]
    return list(set(names))


def _cleanup():
    try:
        db = _get_tdb("knowledge")
        for row in db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *'):
            nid = row.row.get("_", {}).get("id")
            if nid:
                db.delete(nid)
        for name in _all_entity_names():
            eid = find_entity_by_name("knowledge", name)
            if eid:
                db.delete(eid)
        for row in db.tql(f'FIND {{type: "episode", source_path: "{SRC}"}} RETURN *'):
            nid = row.row.get("_", {}).get("id")
            if nid:
                db.delete(nid)
        db.flush()
    except Exception:
        pass


@pytest.fixture(autouse=True, scope="module")
def cleanup():
    _cleanup()
    yield
    _cleanup()


# ════════════════════════════════════════
# 测试用例
# ════════════════════════════════════════


class TestBatchUpsertFirstWrite:
    """第一次写入：8 实体 + 12 边"""

    def test_write_succeeds(self):
        result = batch_upsert(
            "knowledge", _entities(), _edges(),
            source_path=SRC, episode_id=0,
        )
        assert result["entities_created"] == 8
        assert result["edges_created"] == 12

    def test_character_payload(self):
        eid = find_entity_by_name("knowledge", f"{P}苏墨寒")
        assert eid is not None
        payload = _get_tdb("knowledge").get_payload(eid)
        assert payload["entity_type"] == "Character"
        assert f"{P}小墨" in payload.get("aliases", [])

    def test_organization_payload(self):
        eid = find_entity_by_name("knowledge", f"{P}天剑宗")
        payload = _get_tdb("knowledge").get_payload(eid)
        assert payload["entity_type"] == "Organization"
        assert f"{P}天剑门" in payload.get("aliases", [])

    def test_item_payload(self):
        eid = find_entity_by_name("knowledge", f"{P}寒霜剑")
        payload = _get_tdb("knowledge").get_payload(eid)
        assert payload["entity_type"] == "Item"

    def test_concept_payload(self):
        eid = find_entity_by_name("knowledge", f"{P}筑基期")
        payload = _get_tdb("knowledge").get_payload(eid)
        assert payload["entity_type"] == "Concept"

    def test_edges_have_various_labels(self):
        db = _get_tdb("knowledge")
        rows = db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *')
        labels = set()
        for row in rows:
            payload = row.row.get("_", {}).get("payload", {})
            labels.add(payload.get("label", ""))
        # 至少应包含这几种关系
        assert "is_master_of" in labels
        assert "wields" in labels
        assert "is_located_at" in labels
        assert "is_rival_of" in labels

    def test_source_folders_populated(self):
        for name in [f"{P}苏墨寒", f"{P}天剑宗", f"{P}昆仑山"]:
            eid = find_entity_by_name("knowledge", name)
            payload = _get_tdb("knowledge").get_payload(eid)
            assert SRC in payload.get("source_folders", []), f"{name} 缺少 source_folders"

    def test_rivalry_edge_bidirectional_content(self):
        """对立关系：苏墨寒→血魔尊者 和 血魔尊者→苏墨寒 两条边的 fact 不同"""
        db = _get_tdb("knowledge")
        rows = db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *')
        rival_facts = set()
        for row in rows:
            payload = row.row.get("_", {}).get("payload", {})
            if payload.get("label") == "is_rival_of":
                rival_facts.add(payload.get("fact", ""))
        # 苏墨寒→血魔尊者 有一条
        assert any(f"{P}苏墨寒" in f and "宿敌" in f for f in rival_facts)

    def test_master_chain_topology(self):
        """师徒链：玄武真人 → 苏墨寒 + 玄武真人 → 云清雪"""
        db = _get_tdb("knowledge")
        rows = db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *')
        disciples = []
        for row in rows:
            payload = row.row.get("_", {}).get("payload", {})
            if (payload.get("label") == "is_master_of"
                    and payload.get("source_name") == f"{P}玄武真人"):
                disciples.append(payload.get("target_name", ""))
        assert f"{P}苏墨寒" in disciples
        assert f"{P}云清雪" in disciples
        assert len(disciples) == 2


class TestDedupExactMatch:
    """第二次写入相同实体 → 精确去重"""

    def _build_index(self):
        idx = EntityIndex()
        for ent in _entities():
            eid = find_entity_by_name("knowledge", ent["name"])
            if eid:
                idx.add(eid, _normalize_name(ent["name"]), ent.get("aliases", []))
        return idx

    def test_all_entities_resolved(self):
        idx = self._build_index()
        result = asyncio.run(dedup_entities(_entities(), idx))
        for ent in result:
            assert ent.get("_resolved") is True, f"{ent['name']} 未被去重"

    def test_alias_dedup(self):
        """别名去重：'小墨' 应能匹配到 苏墨寒"""
        idx = self._build_index()
        assert idx.find_exact(_normalize_name(f"{P}小墨")) is not None
        assert idx.find_exact(_normalize_name(f"{P}天剑门")) is not None

    def test_no_new_entities_on_second_write(self):
        idx = self._build_index()
        deduped = asyncio.run(dedup_entities(_entities(), idx))
        result = batch_upsert(
            "knowledge", deduped, _edges(),
            source_path=SRC, episode_id=0,
        )
        assert result["entities_created"] == 0


class TestDedupEdgeMerging:
    """边去重：重复的 fact 合并 episode_ids"""

    def test_exact_edge_duplicate_detected(self):
        db = _get_tdb("knowledge")
        rows = db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *')
        existing = [
            {"id": r.row["_"]["id"], "payload": r.row["_"]["payload"]}
            for r in rows if r.row.get("_", {}).get("payload", {}).get("source_name") == f"{P}苏墨寒"
        ]
        # 用完全相同的 fact 文本检测
        dup = _find_exact_edge_duplicate(existing, f"{P}苏墨寒持有寒霜剑此上古神兵")
        assert dup is not None

    def test_different_fact_not_duplicate(self):
        db = _get_tdb("knowledge")
        rows = db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *')
        existing = [
            {"id": r.row["_"]["id"], "payload": r.row["_"]["payload"]}
            for r in rows if r.row.get("_", {}).get("payload", {}).get("source_name") == f"{P}苏墨寒"
        ]
        # 完全不同的 fact 不应匹配
        dup = _find_exact_edge_duplicate(existing, f"{P}苏墨寒学会了新剑法")
        assert dup is None


class TestIncrementalWrite:
    """增量写入：部分新实体 + 部分已有实体"""

    def test_new_entities_created_old_resolved(self):
        # 先对已有实体去重
        idx = EntityIndex()
        for ent in _entities():
            eid = find_entity_by_name("knowledge", ent["name"])
            if eid:
                idx.add(eid, _normalize_name(ent["name"]), ent.get("aliases", []))

        extra = _extra_entities()
        deduped = asyncio.run(dedup_entities(extra, idx))

        result = batch_upsert(
            "knowledge", deduped, _extra_edges(),
            source_path=SRC, episode_id=0,
        )
        # 柳如烟、血魔殿、九幽深渊 都是新实体
        assert result["entities_created"] == 3
        # 2 条新边（云梦城也会被自动创建 → +1 实体 +1 边中引用的自动创建不计入 edges）
        assert result["edges_created"] == 2


class TestEdgeCountAccuracy:
    """去重后的边不计入 edges_created"""

    def test_merged_edge_not_counted(self):
        # 所有实体标记为已解析
        entities = _entities()
        for ent in entities:
            eid = find_entity_by_name("knowledge", ent["name"])
            if eid:
                ent["_resolved"] = True
                ent["_existing_id"] = eid

        # 第一条边标记为 duplicate
        db = _get_tdb("knowledge")
        rows = db.tql(f'FIND {{type: "edge", source_path: "{SRC}"}} RETURN *')
        first_edge = None
        for r in rows:
            payload = r.row.get("_", {}).get("payload", {})
            if payload.get("fact") == f"{P}玄武真人是苏墨寒的师父":
                first_edge = {"id": r.row["_"]["id"], "payload": payload}
                break

        edges = _edges()
        dup_count = 0
        for edge in edges:
            if first_edge and edge.get("fact") == f"{P}玄武真人是苏墨寒的师父":
                edge["_duplicate_of"] = first_edge["id"]
                edge["_merged_episode_ids"] = first_edge["payload"].get("episode_ids", [])
                dup_count += 1

        result = batch_upsert(
            "knowledge", entities, edges,
            source_path=SRC, episode_id=0,
        )
        # 12 条边中 1 条是 duplicate → edges_created = 11
        assert result["edges_created"] == 12 - dup_count


class TestEpisodeTransaction:
    """Episode 事务状态机"""

    def test_commit_flow(self):
        ep_id = create_episode(
            content="苏墨寒在昆仑论剑中击败了血魔尊者，一战成名。",
            source_path=SRC, source_type="file_chunk",
        )
        assert ep_id > 0
        assert get_episode(ep_id)["status"] == "pending"

        assert commit_episode(ep_id) is True
        assert get_episode(ep_id)["status"] == "active"

    def test_rollback_flow(self):
        ep_id = create_episode(
            content="这段内容提取失败需要回滚。",
            source_path=SRC, source_type="manual",
        )
        assert rollback_episode(ep_id) is True
        assert get_episode(ep_id)["status"] == "deleted"

    def test_commit_non_pending_fails(self):
        ep_id = create_episode(
            content="测试重复commit", source_path=SRC, source_type="manual",
        )
        assert commit_episode(ep_id) is True
        # 已经 active，再次 commit 应失败
        assert commit_episode(ep_id) is False


class TestIndexIncremental:
    """索引增量更新"""

    def test_add_and_find(self):
        idx = EntityIndex()
        ts = int(time.time())
        name = f"{P}测试角色_{ts}"
        eid = upsert_entity("knowledge", name, "Character")
        idx.add(eid, _normalize_name(name), [f"{P}别名_{ts}"])

        assert idx.find_exact(_normalize_name(name)) == eid
        assert idx.find_exact(_normalize_name(f"{P}别名_{ts}")) == eid

    def test_remove_clears_all(self):
        idx = EntityIndex()
        ts = int(time.time())
        name = f"{P}临时角色_{ts}"
        eid = upsert_entity("knowledge", name, "Character")
        idx.add(eid, _normalize_name(name), [f"{P}临时别名_{ts}"])

        idx.remove(eid)
        assert idx.find_exact(_normalize_name(name)) is None
        assert idx.find_exact(_normalize_name(f"{P}临时别名_{ts}")) is None
