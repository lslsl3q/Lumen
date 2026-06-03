"""
plot — 5 级 Plot 系统 CRUD + 聚合查询

表：plot, plot_arcs, plot_lines, plot_nodes, plot_beats, plot_links, plot_node_scenes

层级：Plot → Arc → Line → Node → Beat + Link（跨线因果）
"""

import time
import uuid

from ._base import get_conn, write_lock

__all__ = [
    # L1: Plot
    "get_or_create_plot", "update_plot",
    # L2: Arc
    "create_arc", "list_arcs", "update_arc", "delete_arc", "reorder_arcs",
    # L3: Line
    "create_line", "list_lines", "update_line", "delete_line", "reorder_lines",
    # L4: Node
    "create_node", "list_nodes", "update_node", "delete_node", "reorder_nodes",
    # L5: Beat
    "create_beat", "list_beats", "update_beat", "delete_beat", "reorder_beats",
    # Link
    "create_link", "list_links_for_node", "delete_link",
    # Aggregate
    "get_plot_tree", "get_plot_for_scene", "get_plot_outline_for_project",
    # Constants
    "VALID_LINE_TYPES", "VALID_LINE_STATUSES", "VALID_NODE_STATUSES",
    "VALID_BEAT_KINDS", "VALID_LINK_RELATIONS",
]


# ── Constants ──

VALID_LINE_TYPES = {"main", "subplot", "dark"}
VALID_LINE_STATUSES = {"active", "dormant", "surfaced", "resolved"}
VALID_NODE_STATUSES = {"active", "dormant", "surfaced", "resolved"}
VALID_BEAT_KINDS = {
    "action", "conflict", "despair", "relief", "reward",
    "twist", "result", "escalation", "scheme", "revenge",
    "romance", "comedy", "cliffhanger", "lore-reveal",
}
VALID_LINK_RELATIONS = {"trigger", "foreshadow", "suspense", "reveal"}


def _normalize_node(d: dict) -> dict:
    """Normalize SQLite INTEGER fields to Python/JSON types for PlotNode."""
    if "resolved" in d and not isinstance(d["resolved"], bool):
        d["resolved"] = bool(d["resolved"])
    return d


# ── L1: Plot ──

def get_or_create_plot(project_id: str) -> dict:
    conn = get_conn()
    row = conn.execute("SELECT * FROM plot WHERE project_id = ?", (project_id,)).fetchone()
    if row:
        return dict(row)
    pid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO plot (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (pid, project_id, now, now),
        )
        conn.commit()
    return {"id": pid, "project_id": project_id, "title": "", "summary": "",
            "metadata": "{}", "created_at": now, "updated_at": now}


def update_plot(plot_id: str, **kwargs) -> dict | None:
    allowed = {"title", "summary", "metadata"}
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        raise ValueError("No valid fields to update")
    now = time.time()
    fields["updated_at"] = now
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [plot_id]
    with write_lock:
        conn = get_conn()
        conn.execute(f"UPDATE plot SET {sets} WHERE id = ?", vals)
        conn.commit()
    row = conn.execute("SELECT * FROM plot WHERE id = ?", (plot_id,)).fetchone()
    return dict(row) if row else None


# ── L2: PlotArc ──

def create_arc(plot_id: str, title: str = "", summary: str = "") -> dict:
    aid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        mx = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM plot_arcs WHERE plot_id = ?", (plot_id,)).fetchone()[0]
        conn.execute(
            "INSERT INTO plot_arcs (id, plot_id, title, summary, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (aid, plot_id, title, summary, mx + 1, now, now),
        )
        conn.commit()
    return {"id": aid, "plot_id": plot_id, "title": title, "summary": summary,
            "sort_order": mx + 1, "metadata": "{}", "created_at": now, "updated_at": now}


def list_arcs(plot_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM plot_arcs WHERE plot_id = ? ORDER BY sort_order", (plot_id,)).fetchall()
    return [dict(r) for r in rows]


def update_arc(arc_id: str, **kwargs) -> dict | None:
    allowed = {"title", "summary", "status", "sort_order", "metadata"}
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        raise ValueError("No valid fields to update")
    now = time.time()
    fields["updated_at"] = now
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [arc_id]
    with write_lock:
        conn = get_conn()
        conn.execute(f"UPDATE plot_arcs SET {sets} WHERE id = ?", vals)
        conn.commit()
    row = conn.execute("SELECT * FROM plot_arcs WHERE id = ?", (arc_id,)).fetchone()
    return dict(row) if row else None


def delete_arc(arc_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM plot_arcs WHERE id = ?", (arc_id,))
        conn.commit()


def reorder_arcs(plot_id: str, ordered_ids: list[str]) -> None:
    with write_lock:
        conn = get_conn()
        for i, aid in enumerate(ordered_ids):
            conn.execute("UPDATE plot_arcs SET sort_order = ? WHERE id = ? AND plot_id = ?", (i, aid, plot_id))
        conn.commit()


# ── L3: PlotLine ──

def create_line(arc_id: str, name: str = "", title: str = "",
                type: str = "subplot", color: str = "#6b7280") -> dict:
    if type not in VALID_LINE_TYPES:
        type = "subplot"
    lid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        mx = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM plot_lines WHERE arc_id = ?", (arc_id,)).fetchone()[0]
        conn.execute(
            "INSERT INTO plot_lines (id, arc_id, name, title, type, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (lid, arc_id, name, title, type, color, mx + 1, now, now),
        )
        conn.commit()
    return {"id": lid, "arc_id": arc_id, "name": name, "title": title, "type": type,
            "color": color, "status": "active", "summary": "", "sort_order": mx + 1,
            "metadata": "{}", "created_at": now, "updated_at": now}


def list_lines(arc_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM plot_lines WHERE arc_id = ? ORDER BY sort_order", (arc_id,)).fetchall()
    return [dict(r) for r in rows]


def update_line(line_id: str, **kwargs) -> dict | None:
    allowed = {"name", "title", "type", "color", "status", "summary", "sort_order", "metadata"}
    if "type" in kwargs and kwargs["type"] not in VALID_LINE_TYPES:
        del kwargs["type"]
    if "status" in kwargs and kwargs["status"] not in VALID_LINE_STATUSES:
        del kwargs["status"]
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        raise ValueError("No valid fields to update")
    now = time.time()
    fields["updated_at"] = now
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [line_id]
    with write_lock:
        conn = get_conn()
        conn.execute(f"UPDATE plot_lines SET {sets} WHERE id = ?", vals)
        conn.commit()
    row = conn.execute("SELECT * FROM plot_lines WHERE id = ?", (line_id,)).fetchone()
    return dict(row)


def delete_line(line_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM plot_lines WHERE id = ?", (line_id,))
        conn.commit()


def reorder_lines(arc_id: str, ordered_ids: list[str]) -> None:
    with write_lock:
        conn = get_conn()
        for i, lid in enumerate(ordered_ids):
            conn.execute("UPDATE plot_lines SET sort_order = ? WHERE id = ? AND arc_id = ?", (i, lid, arc_id))
        conn.commit()


# ── L4: PlotNode ──

def create_node(line_id: str, title: str = "", summary: str = "", purpose: str = "",
                scene_ids: list[str] | None = None, start_ch: int | None = None,
                end_ch: int | None = None, resolved: bool = False) -> dict:
    nid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        mx = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM plot_nodes WHERE line_id = ?", (line_id,)).fetchone()[0]
        conn.execute(
            "INSERT INTO plot_nodes (id, line_id, title, summary, purpose, sort_order, start_ch, end_ch, resolved, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (nid, line_id, title, summary, purpose, mx + 1, start_ch, end_ch, 1 if resolved else 0, now, now),
        )
        if scene_ids:
            for si, sid in enumerate(scene_ids):
                pns_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO plot_node_scenes (id, node_id, scene_id, sort_order) VALUES (?, ?, ?, ?)",
                    (pns_id, nid, sid, si),
                )
        conn.commit()
    return _normalize_node({"id": nid, "line_id": line_id, "title": title, "summary": summary,
            "purpose": purpose, "sort_order": mx + 1, "start_ch": start_ch, "end_ch": end_ch,
            "resolved": resolved, "metadata": "{}",
            "scene_ids": scene_ids or [], "created_at": now, "updated_at": now})


def list_nodes(line_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM plot_nodes WHERE line_id = ? ORDER BY sort_order", (line_id,)).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        scenes = conn.execute(
            "SELECT scene_id FROM plot_node_scenes WHERE node_id = ? ORDER BY sort_order",
            (d["id"],),
        ).fetchall()
        d["scene_ids"] = [s["scene_id"] for s in scenes]
        _normalize_node(d)
        result.append(d)
    return result


def update_node(node_id: str, **kwargs) -> dict:
    allowed = {"title", "summary", "purpose", "status", "sort_order", "metadata", "start_ch", "end_ch", "resolved"}
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if "status" in fields and fields["status"] not in VALID_NODE_STATUSES:
        del fields["status"]
    # Convert bool → int for SQLite
    if "resolved" in fields and isinstance(fields["resolved"], bool):
        fields["resolved"] = 1 if fields["resolved"] else 0
    has_scene_update = "scene_ids" in kwargs and kwargs["scene_ids"] is not None
    if not fields and not has_scene_update:
        raise ValueError("No valid fields to update")
    now = time.time()
    with write_lock:
        conn = get_conn()
        if fields:
            fields["updated_at"] = now
            sets = ", ".join(f"{k} = ?" for k in fields)
            vals = list(fields.values()) + [node_id]
            conn.execute(f"UPDATE plot_nodes SET {sets} WHERE id = ?", vals)
        if has_scene_update:
            conn.execute("DELETE FROM plot_node_scenes WHERE node_id = ?", (node_id,))
            for i, sid in enumerate(kwargs["scene_ids"]):
                pns_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO plot_node_scenes (id, node_id, scene_id, sort_order) VALUES (?, ?, ?, ?)",
                    (pns_id, node_id, sid, i),
                )
        conn.commit()
    row = conn.execute("SELECT * FROM plot_nodes WHERE id = ?", (node_id,)).fetchone()
    d = dict(row)
    scenes = conn.execute(
        "SELECT scene_id FROM plot_node_scenes WHERE node_id = ? ORDER BY sort_order",
        (node_id,),
    ).fetchall()
    d["scene_ids"] = [s["scene_id"] for s in scenes]
    _normalize_node(d)
    return d


def delete_node(node_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM plot_nodes WHERE id = ?", (node_id,))
        conn.commit()


def reorder_nodes(line_id: str, ordered_ids: list[str]) -> None:
    with write_lock:
        conn = get_conn()
        for i, nid in enumerate(ordered_ids):
            conn.execute("UPDATE plot_nodes SET sort_order = ? WHERE id = ? AND line_id = ?", (i, nid, line_id))
        conn.commit()


# ── L5: PlotBeat ──

def create_beat(node_id: str, kind: str = "action", summary: str = "",
                effect: str = "") -> dict:
    if kind not in VALID_BEAT_KINDS:
        kind = "action"
    bid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        mx = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM plot_beats WHERE node_id = ?", (node_id,)).fetchone()[0]
        conn.execute(
            "INSERT INTO plot_beats (id, node_id, kind, summary, effect, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (bid, node_id, kind, summary, effect, mx + 1, now, now),
        )
        conn.commit()
    return {"id": bid, "node_id": node_id, "kind": kind, "summary": summary,
            "effect": effect, "sort_order": mx + 1,
            "metadata": "{}", "created_at": now, "updated_at": now}


def list_beats(node_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM plot_beats WHERE node_id = ? ORDER BY sort_order", (node_id,)).fetchall()
    return [dict(r) for r in rows]


def update_beat(beat_id: str, **kwargs) -> dict | None:
    allowed = {"kind", "summary", "effect", "sort_order", "metadata"}
    if "kind" in kwargs and kwargs["kind"] not in VALID_BEAT_KINDS:
        del kwargs["kind"]
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        raise ValueError("No valid fields to update")
    now = time.time()
    fields["updated_at"] = now
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [beat_id]
    with write_lock:
        conn = get_conn()
        conn.execute(f"UPDATE plot_beats SET {sets} WHERE id = ?", vals)
        conn.commit()
    row = conn.execute("SELECT * FROM plot_beats WHERE id = ?", (beat_id,)).fetchone()
    return dict(row)


def delete_beat(beat_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM plot_beats WHERE id = ?", (beat_id,))
        conn.commit()


def reorder_beats(node_id: str, ordered_ids: list[str]) -> None:
    with write_lock:
        conn = get_conn()
        for i, bid in enumerate(ordered_ids):
            conn.execute("UPDATE plot_beats SET sort_order = ? WHERE id = ? AND node_id = ?", (i, bid, node_id))
        conn.commit()


# ── PlotLink ──

def create_link(source_node_id: str, target_node_id: str, relation: str = "trigger",
                note: str = "") -> dict:
    if relation not in VALID_LINK_RELATIONS:
        relation = "trigger"
    lid = str(uuid.uuid4())
    now = time.time()
    with write_lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO plot_links (id, source_node_id, target_node_id, relation, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (lid, source_node_id, target_node_id, relation, note, now, now),
        )
        conn.commit()
    return {"id": lid, "source_node_id": source_node_id, "target_node_id": target_node_id,
            "relation": relation, "note": note, "sort_order": 0,
            "created_at": now, "updated_at": now}


def list_links_for_node(node_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM plot_links WHERE source_node_id = ? OR target_node_id = ?",
        (node_id, node_id),
    ).fetchall()
    return [dict(r) for r in rows]


def delete_link(link_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute("DELETE FROM plot_links WHERE id = ?", (link_id,))
        conn.commit()


# ── Aggregate: full plot tree ──

def get_plot_tree(project_id: str) -> dict | None:
    conn = get_conn()
    plot_row = conn.execute("SELECT * FROM plot WHERE project_id = ?", (project_id,)).fetchone()
    if not plot_row:
        return None
    plot = dict(plot_row)
    arcs = conn.execute("SELECT * FROM plot_arcs WHERE plot_id = ? ORDER BY sort_order", (plot["id"],)).fetchall()
    plot["arcs"] = []
    for arc_row in arcs:
        arc = dict(arc_row)
        lines = conn.execute("SELECT * FROM plot_lines WHERE arc_id = ? ORDER BY sort_order", (arc["id"],)).fetchall()
        arc["lines"] = []
        for line_row in lines:
            line = dict(line_row)
            nodes = conn.execute("SELECT * FROM plot_nodes WHERE line_id = ? ORDER BY sort_order", (line["id"],)).fetchall()
            line["nodes"] = []
            for node_row in nodes:
                node = dict(node_row)
                scenes = conn.execute(
                    "SELECT scene_id FROM plot_node_scenes WHERE node_id = ? ORDER BY sort_order",
                    (node["id"],),
                ).fetchall()
                node["scene_ids"] = [s["scene_id"] for s in scenes]
                beats = conn.execute(
                    "SELECT * FROM plot_beats WHERE node_id = ? ORDER BY sort_order",
                    (node["id"],),
                ).fetchall()
                node["beats"] = [dict(b) for b in beats]
                _normalize_node(node)
                line["nodes"].append(node)
            arc["lines"].append(line)
        plot["arcs"].append(arc)
    return plot


# ── Aggregate: plot context for a specific scene ──

def get_plot_for_scene(scene_id: str) -> dict | None:
    """查询 scene 关联的 PlotNode 及其完整层级链（Node→Line→Arc→Plot）

    返回结构：
    {
        "plot": {...},
        "arc": {...},
        "line": {...},
        "node": {..., "beats": [...]},
        "sibling_nodes": [...],  # 同 Line 下其他 Node（带 relative_order）
        "linked_nodes": [...]    # 通过 PlotLink 关联的 Node
    }
    """
    conn = get_conn()

    # 1. 找到 scene 关联的 node
    ns_row = conn.execute(
        "SELECT node_id FROM plot_node_scenes WHERE scene_id = ?",
        (scene_id,),
    ).fetchone()
    if not ns_row:
        return None

    node_id = ns_row["node_id"]

    # 2. 加载 node 及其 beats
    node_row = conn.execute("SELECT * FROM plot_nodes WHERE id = ?", (node_id,)).fetchone()
    if not node_row:
        return None
    node = dict(node_row)
    beats = conn.execute(
        "SELECT * FROM plot_beats WHERE node_id = ? ORDER BY sort_order",
        (node_id,),
    ).fetchall()
    node["beats"] = [dict(b) for b in beats]

    # 3. 沿层级链向上查找：node → line → arc → plot
    line_row = conn.execute("SELECT * FROM plot_lines WHERE id = ?", (node["line_id"],)).fetchone()
    if not line_row:
        return None
    line = dict(line_row)

    arc_row = conn.execute("SELECT * FROM plot_arcs WHERE id = ?", (line["arc_id"],)).fetchone()
    if not arc_row:
        return None
    arc = dict(arc_row)

    plot_row = conn.execute("SELECT * FROM plot WHERE id = ?", (arc["plot_id"],)).fetchone()
    if not plot_row:
        return None
    plot = dict(plot_row)

    # 4. 同 Line 下其他 Node（带相对位置）
    sibling_rows = conn.execute(
        "SELECT id, title, status, sort_order FROM plot_nodes WHERE line_id = ? ORDER BY sort_order",
        (line["id"],),
    ).fetchall()
    current_sort = node.get("sort_order", 0)
    sibling_nodes = []
    for s in sibling_rows:
        if s["id"] == node_id:
            continue
        sib = {"title": s["title"], "status": s["status"]}
        sib["relative_order"] = "past" if s["sort_order"] < current_sort else "future"
        sibling_nodes.append(sib)

    # 5. PlotLink 关联的 Node
    link_rows = conn.execute(
        "SELECT * FROM plot_links WHERE source_node_id = ? OR target_node_id = ?",
        (node_id, node_id),
    ).fetchall()

    linked_nodes = []
    for lr in link_rows:
        linked_node_id = lr["target_node_id"] if lr["source_node_id"] == node_id else lr["source_node_id"]
        linked_node_row = conn.execute("SELECT * FROM plot_nodes WHERE id = ?", (linked_node_id,)).fetchone()
        if linked_node_row:
            ln = dict(linked_node_row)
            ln["relation_type"] = lr["relation"]
            ln["link_note"] = lr["note"]
            linked_nodes.append(ln)

    return {
        "plot": plot,
        "arc": arc,
        "line": line,
        "node": node,
        "sibling_nodes": sibling_nodes,
        "linked_nodes": linked_nodes,
    }


def get_plot_outline_for_project(project_id: str) -> dict | None:
    """返回 Plot 全景概要，精简版（只有 title/status/summary + beat_count）

    resolved 的 node 不展开 beat 列表，只保留标题和状态。
    """
    conn = get_conn()
    plot_row = conn.execute("SELECT * FROM plot WHERE project_id = ?", (project_id,)).fetchone()
    if not plot_row:
        return None
    plot = dict(plot_row)

    arcs = conn.execute(
        "SELECT id, title, status, sort_order FROM plot_arcs WHERE plot_id = ? ORDER BY sort_order",
        (plot["id"],),
    ).fetchall()
    plot["arcs"] = []
    for arc_row in arcs:
        arc = {"title": arc_row["title"], "status": arc_row["status"]}

        lines = conn.execute(
            "SELECT id, title, status, summary, type, sort_order FROM plot_lines WHERE arc_id = ? ORDER BY sort_order",
            (arc_row["id"],),
        ).fetchall()
        arc["lines"] = []
        for line_row in lines:
            line = {
                "title": line_row["title"],
                "status": line_row["status"],
                "summary": line_row["summary"],
                "line_type": line_row["type"],
            }

            nodes = conn.execute(
                "SELECT id, title, status, sort_order FROM plot_nodes WHERE line_id = ? ORDER BY sort_order",
                (line_row["id"],),
            ).fetchall()

            # 批量获取 beat 计数（避免 N+1）
            beat_counts = {}
            if nodes:
                node_ids = [n["id"] for n in nodes]
                placeholders = ",".join("?" * len(node_ids))
                count_rows = conn.execute(
                    f"SELECT node_id, COUNT(*) as cnt FROM plot_beats WHERE node_id IN ({placeholders}) GROUP BY node_id",
                    node_ids,
                ).fetchall()
                for cr in count_rows:
                    beat_counts[cr["node_id"]] = cr["cnt"]

            line["nodes"] = []
            for node_row in nodes:
                n = {"title": node_row["title"], "status": node_row["status"]}
                n["beat_count"] = beat_counts.get(node_row["id"], 0)
                n["resolved"] = node_row["status"] == "resolved"
                line["nodes"].append(n)

            arc["lines"].append(line)
        plot["arcs"].append(arc)

    return plot
