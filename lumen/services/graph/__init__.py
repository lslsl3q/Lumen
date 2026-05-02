"""
services/graph/ — 图谱存储与操作

核心模块：_core.py (实体/边 CRUD)
提取管道：extract.py
备份恢复：backup.py
"""

from lumen.services.graph._core import (
    find_entity_by_name,
    upsert_entity,
    upsert_edge,
    batch_upsert,
    get_entity_neighbors_text,
)

from lumen.services.graph.extract import (
    extract_and_store,
)

from lumen.services.graph.backup import (
    get_backup_path,
    save_graph,
    restore_graph,
    auto_git_commit,
)
