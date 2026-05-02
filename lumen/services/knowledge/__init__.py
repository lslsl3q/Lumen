"""
services/knowledge/ — 知识库存储与操作

核心模块：_core.py (CRUD + 搜索 + 导入)
扫描服务：scanner.py
注册表：manifest.py
分块器：chunker.py
"""

from lumen.services.knowledge._core import (
    # 公开接口
    list_files,
    get_file,
    import_file,
    refine_with_sentences,
    search,
    search_agent_knowledge,
    delete_file,
    reindex_file,
    close,
    cleanup_orphan_registry,
    rebuild_if_empty,
    get_last_search_meta,
    MANIFEST_PATH,
    KNOWLEDGE_SOURCE_DIR,
    # 内部接口（外部模块直接引用，待 T24 清理）
    _get_db,
    _get_agent_db,
    _get_sentence_db,
    _load_registry,
    _save_registry,
    _read_file_content,
    _clear_registry_cache,
)

from lumen.services.knowledge.scanner import (
    scan_knowledge_lib,
    get_dirty_files,
    update_registry_entry,
)

from lumen.services.knowledge.manifest import (
    load_kb_manifest,
    save_kb_manifest,
    ensure_manifest_for_existing_kb,
    list_kbs,
    create_kb,
    delete_kb,
    get_kb,
)

from lumen.services.knowledge.chunker import (
    chunk_text,
    split_sentences,
)
