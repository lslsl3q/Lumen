/**
 * Author's Note API 客户端
 */
import type { AuthorsNoteConfig, AuthorsNoteUpdatePayload } from '../types/authorNote';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /authors-note/:sessionId */
export async function getAuthorsNote(sessionId: string): Promise<AuthorsNoteConfig | null> {
  const res = await fetch(`${API_BASE_URL}/authors-note/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`获取 Author's Note 失败: ${res.status}`);
  const data = await res.json();
  return data ?? null;
}

/** PUT /authors-note/:sessionId */
export async function saveAuthorsNote(sessionId: string, payload: AuthorsNoteUpdatePayload): Promise<AuthorsNoteConfig> {
  const res = await fetch(`${API_BASE_URL}/authors-note/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `保存 Author's Note 失败: ${res.status}`);
  }
  return res.json();
}

/** DELETE /authors-note/:sessionId */
export async function deleteAuthorsNote(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/authors-note/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `删除 Author's Note 失败: ${res.status}`);
  }
}
