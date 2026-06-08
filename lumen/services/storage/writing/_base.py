"""
writing 存储层共享基础设施

提供 DB 连接管理、写锁、表初始化/迁移。
所有子模块通过 ``from ._base import get_conn, write_lock`` 使用。
"""

import sqlite3
import os
import json
import logging
import threading

from lumen.config import WRITING_DB

logger = logging.getLogger(__name__)

DB_PATH = WRITING_DB

_local = threading.local()
write_lock = threading.Lock()


def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=True)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
        _init_tables(_local.conn)
    return _local.conn


def close_conn():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None


def _init_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS writing_projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            channel_id  TEXT DEFAULT '',
            metadata    TEXT DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL
        );

        -- NEW: Acts table
        CREATE TABLE IF NOT EXISTS writing_acts (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            numerate    INTEGER NOT NULL DEFAULT 1,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wa_project ON writing_acts(project_id);

        -- MODIFIED: Chapters table (removed content/word_count/volume, added act_id/numerate/show_number)
        CREATE TABLE IF NOT EXISTS writing_chapters (
            id          TEXT PRIMARY KEY,
            act_id      TEXT NOT NULL,
            project_id  TEXT NOT NULL DEFAULT '',
            title       TEXT NOT NULL DEFAULT '',
            numerate    INTEGER NOT NULL DEFAULT 1,
            show_number INTEGER NOT NULL DEFAULT 1,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (act_id) REFERENCES writing_acts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wc_act ON writing_chapters(act_id);
        CREATE INDEX IF NOT EXISTS idx_wc_project ON writing_chapters(project_id);

        -- NEW: Scenes table
        CREATE TABLE IF NOT EXISTS writing_scenes (
            id           TEXT PRIMARY KEY,
            chapter_id   TEXT NOT NULL,
            content      TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
            summary      TEXT NOT NULL DEFAULT '',
            subtitle     TEXT NOT NULL DEFAULT '',
            codex_ids    TEXT NOT NULL DEFAULT '[]',
            label_ids    TEXT NOT NULL DEFAULT '[]',
            pov_codex_id TEXT DEFAULT NULL,
            scene_number INTEGER NOT NULL DEFAULT 0,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            created_at   REAL NOT NULL,
            updated_at   REAL NOT NULL,
            FOREIGN KEY (chapter_id) REFERENCES writing_chapters(id) ON DELETE CASCADE,
            FOREIGN KEY (pov_codex_id) REFERENCES codex(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ws_chapter ON writing_scenes(chapter_id);

        CREATE TABLE IF NOT EXISTS codex (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            parent_id   TEXT DEFAULT NULL,
            name        TEXT NOT NULL DEFAULT '',
            type        TEXT NOT NULL DEFAULT 'custom',
            category    TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '{}',
            aliases     TEXT NOT NULL DEFAULT '[]',
            tags        TEXT NOT NULL DEFAULT '[]',
            custom_fields TEXT NOT NULL DEFAULT '{}',
            relations   TEXT NOT NULL DEFAULT '[]',
            graph_entity_id TEXT DEFAULT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_codex_project ON codex(project_id);
        CREATE INDEX IF NOT EXISTS idx_codex_parent ON codex(parent_id);

        -- Snippets: 独立文本片段（草稿/灵感/笔记）
        CREATE TABLE IF NOT EXISTS writing_snippets (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
            pinned      INTEGER NOT NULL DEFAULT 0,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wsnip_project ON writing_snippets(project_id);

        -- 场景标签
        CREATE TABLE IF NOT EXISTS writing_labels (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            color       TEXT NOT NULL DEFAULT 'Gray',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wlbl_project ON writing_labels(project_id);


        -- Chat 线程（写作模式对话持久化）
        CREATE TABLE IF NOT EXISTS writing_chat_threads (
            id          TEXT PRIMARY KEY,
            book_id     TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            ai_mode     TEXT NOT NULL DEFAULT 'chat',
            pinned      INTEGER NOT NULL DEFAULT 0,
            pinned_side TEXT NOT NULL DEFAULT 'right',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (book_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wct_book ON writing_chat_threads(book_id);

        -- Chat 消息
        CREATE TABLE IF NOT EXISTS writing_chat_messages (
            id          TEXT PRIMARY KEY,
            thread_id   TEXT NOT NULL,
            role        TEXT NOT NULL,
            content     TEXT NOT NULL DEFAULT '',
            metadata    TEXT DEFAULT NULL,
            created_at  REAL NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES writing_chat_threads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wcm_thread ON writing_chat_messages(thread_id, created_at);

        -- ── Plot System (5-level structural planning) ──

        -- L1: Plot — 作品级（一本书一个）
        CREATE TABLE IF NOT EXISTS plot (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL UNIQUE,
            title       TEXT NOT NULL DEFAULT '',
            summary     TEXT NOT NULL DEFAULT '',
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES writing_projects(id) ON DELETE CASCADE
        );

        -- L2: PlotArc — 大卷/大阶段
        CREATE TABLE IF NOT EXISTS plot_arcs (
            id          TEXT PRIMARY KEY,
            plot_id     TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            summary     TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL DEFAULT 'active',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (plot_id) REFERENCES plot(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pa_plot ON plot_arcs(plot_id);

        -- L3: PlotLine — 剧情线（主线/支线/暗线）
        CREATE TABLE IF NOT EXISTS plot_lines (
            id          TEXT PRIMARY KEY,
            arc_id      TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            title       TEXT NOT NULL DEFAULT '',
            type        TEXT NOT NULL DEFAULT 'subplot',
            color       TEXT NOT NULL DEFAULT '#6b7280',
            status      TEXT NOT NULL DEFAULT 'active',
            summary     TEXT NOT NULL DEFAULT '',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (arc_id) REFERENCES plot_arcs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pl_arc ON plot_lines(arc_id);

        -- L4: PlotNode — 剧情节点（一个完整事件，可关联多个 Scene）
        CREATE TABLE IF NOT EXISTS plot_nodes (
            id          TEXT PRIMARY KEY,
            line_id     TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            summary     TEXT NOT NULL DEFAULT '',
            purpose     TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL DEFAULT 'active',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            start_ch    INTEGER,
            end_ch      INTEGER,
            resolved    INTEGER NOT NULL DEFAULT 0,
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (line_id) REFERENCES plot_lines(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pn_line ON plot_nodes(line_id);


        -- L5: PlotBeat — 情节节拍（最小叙事单元）
        CREATE TABLE IF NOT EXISTS plot_beats (
            id          TEXT PRIMARY KEY,
            node_id     TEXT NOT NULL,
            kind        TEXT NOT NULL DEFAULT 'setup',
            summary     TEXT NOT NULL DEFAULT '',
            effect      TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL DEFAULT 'planted',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            metadata    TEXT NOT NULL DEFAULT '{}',
            created_at  REAL NOT NULL,
            updated_at  REAL NOT NULL,
            FOREIGN KEY (node_id) REFERENCES plot_nodes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pb_node ON plot_beats(node_id);

        -- PlotLink — 跨线因果关系连接器（连 Node，不连 Beat）
        -- relation 枚举：trigger / foreshadow / suspense / reveal
        CREATE TABLE IF NOT EXISTS plot_links (
            id              TEXT PRIMARY KEY,
            source_node_id  TEXT NOT NULL,
            target_node_id  TEXT NOT NULL,
            relation        TEXT NOT NULL DEFAULT 'trigger',
            note            TEXT NOT NULL DEFAULT '',
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      REAL NOT NULL,
            updated_at      REAL NOT NULL,
            FOREIGN KEY (source_node_id) REFERENCES plot_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_node_id) REFERENCES plot_nodes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_plk_source ON plot_links(source_node_id);
        CREATE INDEX IF NOT EXISTS idx_plk_target ON plot_links(target_node_id);

        -- PlotNode ↔ Scene 关联（M:N）
        CREATE TABLE IF NOT EXISTS plot_node_scenes (
            id          TEXT PRIMARY KEY,
            node_id     TEXT NOT NULL,
            scene_id    TEXT NOT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (node_id) REFERENCES plot_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (scene_id) REFERENCES writing_scenes(id) ON DELETE CASCADE,
            UNIQUE(node_id, scene_id)
        );
        CREATE INDEX IF NOT EXISTS idx_pns_node ON plot_node_scenes(node_id);
        CREATE INDEX IF NOT EXISTS idx_pns_scene ON plot_node_scenes(scene_id);

        -- Codex Progressions — 场景级 Codex 条目演进
        CREATE TABLE IF NOT EXISTS writing_codex_progressions (
            id TEXT PRIMARY KEY,
            codex_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'addition',
            content TEXT NOT NULL DEFAULT '',
            detail_field TEXT DEFAULT '',
            created_at REAL NOT NULL,
            FOREIGN KEY (codex_id) REFERENCES codex(id) ON DELETE CASCADE,
            FOREIGN KEY (scene_id) REFERENCES writing_scenes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_wcp_codex ON writing_codex_progressions(codex_id);
        CREATE INDEX IF NOT EXISTS idx_wcp_scene ON writing_codex_progressions(scene_id);
    """)

    # 删旧表
    conn.execute("DROP TABLE IF EXISTS writing_settings")
    conn.execute("DROP TABLE IF EXISTS writing_thread_nodes")
    conn.execute("DROP TABLE IF EXISTS writing_threads")

    # 统一迁移
    _migrate_columns(conn)
    conn.commit()


def _migrate_columns(conn: sqlite3.Connection):
    """Migrate legacy databases to current schema."""
    import logging
    log = logging.getLogger(__name__)

    # plot_nodes: add start_ch, end_ch, resolved columns
    for col, defn in [("start_ch", "INTEGER"), ("end_ch", "INTEGER"), ("resolved", "INTEGER NOT NULL DEFAULT 0")]:
        try:
            conn.execute(f"ALTER TABLE plot_nodes ADD COLUMN {col} {defn}")
        except Exception:
            pass

    # plot_links: beat-based -> node-based (drop + recreate if old schema exists)
    try:
        conn.execute("SELECT source_beat_id FROM plot_links LIMIT 1")
        log.warning("plot_links has old beat-based schema — dropping and recreating (data lost)")
        conn.execute("DROP TABLE IF EXISTS plot_links")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS plot_links (
                id              TEXT PRIMARY KEY,
                source_node_id  TEXT NOT NULL,
                target_node_id  TEXT NOT NULL,
                relation        TEXT NOT NULL DEFAULT 'trigger',
                note            TEXT NOT NULL DEFAULT '',
                sort_order      INTEGER NOT NULL DEFAULT 0,
                created_at      REAL NOT NULL,
                updated_at      REAL NOT NULL,
                FOREIGN KEY (source_node_id) REFERENCES plot_nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target_node_id) REFERENCES plot_nodes(id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_plk_source ON plot_links(source_node_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_plk_target ON plot_links(target_node_id)")
    except Exception:
        pass  # New schema or table doesn't exist yet

    # plot_arcs: add status/metadata columns if missing
    _ensure_columns(conn, "plot_arcs", {"status": "TEXT NOT NULL DEFAULT 'active'"})

    # plot_lines: add status/summary columns if missing
    _ensure_columns(conn, "plot_lines", {
        "status": "TEXT NOT NULL DEFAULT 'active'",
        "summary": "TEXT NOT NULL DEFAULT ''",
    })

    # plot_nodes: add summary/purpose/status columns if missing
    _ensure_columns(conn, "plot_nodes", {
        "summary": "TEXT NOT NULL DEFAULT ''",
        "purpose": "TEXT NOT NULL DEFAULT ''",
        "status": "TEXT NOT NULL DEFAULT 'active'",
    })

    # codex: add category column if missing
    _ensure_columns(conn, "codex", {
        "category": "TEXT NOT NULL DEFAULT ''",
    })

    # writing_scenes: add pov_codex_id column if missing
    _ensure_columns(conn, "writing_scenes", {
        "pov_codex_id": "TEXT DEFAULT NULL",
    })


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]):
    for col, definition in columns.items():
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
        except Exception:
            pass  # 列已存在，忽略


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    # 解析 JSON 字段
    for key in ("description", "aliases", "tags", "custom_fields", "relations", "metadata", "linked_codex_ids"):
        if key in d and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    return d
