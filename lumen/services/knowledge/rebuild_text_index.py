"""
存量数据补建 TriviumDB 文本索引（BM25 + AC 关键词）

一次性脚本：遍历 knowledge.tdb 和 agent_knowledge.tdb 的所有节点，
为每个节点重建 index_text + index_keyword（语义组联动）。
最后调一次 build_text_index()。

用法：
    python -m lumen.services.knowledge.rebuild_text_index
"""

import json
import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 500


def _rebuild_db(db, db_name: str):
    """重建单个 TDB 的文本索引"""
    all_ids = db.all_node_ids()
    total = len(all_ids)
    if total == 0:
        logger.info(f"[{db_name}] 无节点，跳过")
        return

    logger.info(f"[{db_name}] 开始重建: {total} 个节点")

    # 预加载语义组关键词（topic 类型）
    group_keywords = {}
    try:
        from lumen.services.semantic_group import list_groups
        groups = list_groups(type_="topic")
        for g in groups:
            kws = json.loads(g["keywords"]) if isinstance(g["keywords"], str) else g["keywords"]
            group_keywords[g["group_id"]] = {
                "keywords": kws,
                "name": g.get("name", ""),
            }
        logger.info(f"[{db_name}] 加载 {len(group_keywords)} 个 topic 语义组")
    except Exception as e:
        logger.warning(f"[{db_name}] 语义组加载失败，跳过联动: {e}")

    indexed = 0
    for batch_start in range(0, total, BATCH_SIZE):
        batch_ids = all_ids[batch_start:batch_start + BATCH_SIZE]

        for node_id in batch_ids:
            try:
                payload = db.get_payload(node_id)
                if not payload:
                    continue

                content = payload.get("content", "")
                filename = payload.get("filename", "")
                folder = payload.get("folder", "")
                tags = payload.get("tags", [])

                # BM25 全文索引
                if content:
                    db.index_text(node_id, content)

                # AC 关键词：文件名 + 文件夹
                if filename:
                    db.index_keyword(node_id, filename)
                    name_no_ext = os.path.splitext(filename)[0]
                    if name_no_ext and name_no_ext != filename:
                        db.index_keyword(node_id, name_no_ext)
                if folder:
                    db.index_keyword(node_id, folder)

                # AC 关键词：语义组联动
                if content and group_keywords:
                    text_lower = content.lower()
                    for gid, ginfo in group_keywords.items():
                        kws = ginfo["keywords"]
                        matched = any(kw.lower() in text_lower for kw in kws)
                        if matched:
                            for kw in kws:
                                db.index_keyword(node_id, kw)
                            if ginfo["name"]:
                                db.index_keyword(node_id, ginfo["name"])

                # AC 关键词：tags
                if tags:
                    for tag in tags:
                        if tag:
                            db.index_keyword(node_id, tag)

                indexed += 1

            except Exception as e:
                logger.debug(f"节点 {node_id} 索引失败: {e}")
                continue

        logger.info(f"[{db_name}] 进度: {min(batch_start + BATCH_SIZE, total)}/{total}")

    # 全部完成后构建 AC 自动机（只调一次）
    logger.info(f"[{db_name}] 调用 build_text_index()...")
    try:
        db.build_text_index()
    except Exception as e:
        logger.error(f"[{db_name}] build_text_index 失败: {e}")
        return

    logger.info(f"[{db_name}] 完成: {indexed}/{total} 个节点已索引")


def rebuild_all():
    """重建所有 TDB 的文本索引"""
    from lumen.services.knowledge._core import _get_db, _get_agent_db

    # knowledge.tdb
    try:
        db = _get_db()
        _rebuild_db(db, "knowledge.tdb")
    except Exception as e:
        logger.error(f"knowledge.tdb 重建失败: {e}")

    # agent_knowledge.tdb
    try:
        agent_db = _get_agent_db()
        _rebuild_db(agent_db, "agent_knowledge.tdb")
    except Exception as e:
        logger.error(f"agent_knowledge.tdb 重建失败: {e}")


if __name__ == "__main__":
    rebuild_all()
