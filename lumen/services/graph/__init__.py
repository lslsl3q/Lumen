"""
services/graph/ — 图谱存储与操作

核心模块：_core.py (实体/边 CRUD)
提取管道：extract.py
备份恢复：backup.py
搜索增强：search.py (向量 + 图遍历 + 社群加权)
"""

from lumen.services.graph._core import (
    find_entity_by_name,
    upsert_entity,
    update_source_folders,
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

from lumen.services.graph.search import (
    search_graph,
)
