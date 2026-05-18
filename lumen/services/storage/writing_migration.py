"""
One-time migration from old writing_chapters (HTML blob) to new three-table schema.
Detects old schema by checking if 'content' column exists in writing_chapters.
"""

import json
import logging
import time
import uuid
import sqlite3
from lumen.services.storage.writing import get_conn, write_lock

logger = logging.getLogger(__name__)

MIGRATION_FLAG_TABLE = "_migration_v2_done"


def needs_migration() -> bool:
    """Check if old writing_chapters table has 'content' column (pre-v2)."""
    conn = get_conn()
    # Check if migration flag table exists
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (MIGRATION_FLAG_TABLE,),
    ).fetchone()
    if row:
        return False
    # Check if old chapters table has content column
    cols = conn.execute("PRAGMA table_info(writing_chapters)").fetchall()
    col_names = [c[1] for c in cols]
    return "content" in col_names


def run_migration(project_id: str | None = None) -> dict:
    """Migrate old flat chapters to acts/chapters/scenes tree.

    Strategy: each old chapter -> 1 Act + 1 Chapter + 1 Scene.
    User can later split/reorganize in Plan view.

    Args:
        project_id: If provided, only migrate that project. Otherwise migrate all.
    """
    with write_lock:
        conn = get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")

            # Get all old chapters
            query = "SELECT * FROM writing_chapters ORDER BY project_id, sort_order"
            params: list = []
            if project_id:
                query = "SELECT * FROM writing_chapters WHERE project_id = ? ORDER BY sort_order"
                params = [project_id]
            old_chapters = conn.execute(query, params).fetchall()

            if not old_chapters:
                conn.execute(
                    f"CREATE TABLE IF NOT EXISTS {MIGRATION_FLAG_TABLE} (done_at REAL)"
                )
                conn.execute(f"INSERT INTO {MIGRATION_FLAG_TABLE} VALUES (?)", (time.time(),))
                conn.commit()
                return {"migrated": 0, "acts": 0, "chapters": 0, "scenes": 0}

            # Group by project
            by_project: dict[str, list[sqlite3.Row]] = {}
            for ch in old_chapters:
                pid = ch["project_id"]
                by_project.setdefault(pid, []).append(ch)

            total_acts = total_chs = total_scs = 0

            for pid, chapters in by_project.items():
                act_sort = 0
                for ch in chapters:
                    # Create act for each old chapter
                    act_id = f"act-{uuid.uuid4().hex[:12]}"
                    conn.execute(
                        """INSERT INTO writing_acts (id, project_id, title, numerate, sort_order, created_at, updated_at)
                           VALUES (?, ?, '', 1, ?, ?, ?)""",
                        (act_id, pid, act_sort, ch["created_at"], ch["updated_at"]),
                    )
                    total_acts += 1
                    act_sort += 1

                    # Create chapter under act
                    ch_id = f"ch-{uuid.uuid4().hex[:12]}"
                    conn.execute(
                        """INSERT INTO writing_chapters (id, act_id, project_id, title, numerate, show_number, sort_order, created_at, updated_at)
                           VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?)""",
                        (ch_id, act_id, pid, ch["title"], ch["created_at"], ch["updated_at"]),
                    )
                    total_chs += 1

                    # Create scene — store old HTML in a wrapper JSON for later conversion
                    sc_id = f"sc-{uuid.uuid4().hex[:12]}"
                    old_html = ch["content"] or ""
                    if old_html.strip():
                        content_json = json.dumps({
                            "type": "doc",
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "[MIGRATED: needs HTML->JSON conversion]"}]
                            }]
                        })
                        # Store raw HTML in summary for Phase 3 frontend conversion
                        conn.execute(
                            "INSERT INTO writing_scenes (id, chapter_id, content, summary, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
                            (sc_id, ch_id, content_json,
                             json.dumps({"_migrated_html": old_html}),
                             ch["created_at"], ch["updated_at"]),
                        )
                    else:
                        conn.execute(
                            "INSERT INTO writing_scenes (id, chapter_id, content, summary, sort_order, created_at, updated_at) VALUES (?, ?, ?, '', 0, ?, ?)",
                            (sc_id, ch_id,
                             '{"type":"doc","content":[{"type":"paragraph"}]}',
                             ch["created_at"], ch["updated_at"]),
                        )
                    total_scs += 1

            # Create flag table to mark migration done
            conn.execute(
                f"CREATE TABLE IF NOT EXISTS {MIGRATION_FLAG_TABLE} (done_at REAL)"
            )
            conn.execute(f"INSERT INTO {MIGRATION_FLAG_TABLE} VALUES (?)", (time.time(),))

            conn.commit()
            logger.info(
                "Migration done: %d acts, %d chapters, %d scenes",
                total_acts, total_chs, total_scs,
            )
            return {
                "migrated": len(old_chapters),
                "acts": total_acts,
                "chapters": total_chs,
                "scenes": total_scs,
            }

        except Exception:
            conn.rollback()
            raise
