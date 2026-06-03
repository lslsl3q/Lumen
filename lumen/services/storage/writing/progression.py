'''
progression — Codex Progression CRUD（场景级 Codex 条目演进）

表：writing_codex_progressions
'''

import time
import uuid

from ._base import get_conn, write_lock

__all__ = [
    'create_progression', 'list_progressions_for_codex',
    'list_progressions_for_scene', 'get_active_progressions',
    'delete_progression', 'update_progression',
]


_VALID_MODES = {'addition', 'replace'}


def create_progression(codex_id: str, scene_id: str, content: str = '',
                       mode: str = 'addition', detail_field: str = '') -> dict:
    if mode not in _VALID_MODES:
        raise ValueError(f'Invalid mode {mode!r}, must be one of {_VALID_MODES}')
    pid = f'prg-{uuid.uuid4().hex[:12]}'
    now = time.time()
    with write_lock:
        conn = get_conn()
        conn.execute(
            'INSERT INTO writing_codex_progressions (id, codex_id, scene_id, mode, content, detail_field, created_at) VALUES (?,?,?,?,?,?,?)',
            (pid, codex_id, scene_id, mode, content, detail_field, now),
        )
        conn.commit()
        return dict(conn.execute('SELECT * FROM writing_codex_progressions WHERE id = ?', (pid,)).fetchone())


def list_progressions_for_codex(codex_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM writing_codex_progressions WHERE codex_id = ? ORDER BY created_at ASC',
        (codex_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def list_progressions_for_scene(scene_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM writing_codex_progressions WHERE scene_id = ? ORDER BY created_at ASC',
        (scene_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_active_progressions(book_id: str, current_scene_id: str) -> list[dict]:
    '''返回所有创建场景 <= 当前场景位置的 progressions（2 条 SQL，无 N+1）'''
    conn = get_conn()

    rows = conn.execute(
        'SELECT p.*, c.name as codex_name, c.category as codex_category, '
        '       a.sort_order as _ao, ch.sort_order as _co, s.sort_order as _so '
        'FROM writing_codex_progressions p '
        'LEFT JOIN codex c ON p.codex_id = c.id '
        'JOIN writing_scenes s ON p.scene_id = s.id '
        'JOIN writing_chapters ch ON s.chapter_id = ch.id '
        'JOIN writing_acts a ON ch.act_id = a.id '
        'WHERE a.project_id = ? '
        'ORDER BY a.sort_order, ch.sort_order, s.sort_order, p.created_at',
        (book_id,),
    ).fetchall()

    if not rows:
        return []

    scene_info = conn.execute(
        'SELECT a.sort_order, ch.sort_order, s.sort_order '
        'FROM writing_scenes s '
        'JOIN writing_chapters ch ON s.chapter_id = ch.id '
        'JOIN writing_acts a ON ch.act_id = a.id '
        'WHERE s.id = ?',
        (current_scene_id,),
    ).fetchone()

    if not scene_info:
        return [dict(r) for r in rows]

    cur = (scene_info[0], scene_info[1], scene_info[2])
    result = []
    for row in rows:
        d = dict(row)
        pos = (d.pop('_ao'), d.pop('_co'), d.pop('_so'))
        if pos <= cur:
            result.append(d)

    return result


def update_progression(progression_id: str, **fields) -> dict | None:
    allowed = {'content', 'mode', 'detail_field', 'codex_id'}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if 'mode' in updates and updates['mode'] not in _VALID_MODES:
        raise ValueError(f'Invalid mode {updates["mode"]!r}, must be one of {_VALID_MODES}')
    conn = get_conn()
    if not updates:
        row = conn.execute('SELECT * FROM writing_codex_progressions WHERE id = ?', (progression_id,)).fetchone()
        return dict(row) if row else None
    set_clause = ', '.join(f'{k} = ?' for k in updates)
    with write_lock:
        conn.execute(
            f'UPDATE writing_codex_progressions SET {set_clause} WHERE id = ?',
            (*updates.values(), progression_id),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM writing_codex_progressions WHERE id = ?', (progression_id,)).fetchone()
        return dict(row) if row else None


def delete_progression(progression_id: str) -> None:
    with write_lock:
        conn = get_conn()
        conn.execute('DELETE FROM writing_codex_progressions WHERE id = ?', (progression_id,))
        conn.commit()
