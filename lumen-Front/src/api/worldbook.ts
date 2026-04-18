/**
 * 世界书 API 客户端
 */
import type {
  WorldBookEntry,
  WorldBookListItem,
  WorldBookCreatePayload,
  WorldBookUpdatePayload,
} from '../types/worldbook';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /worldbooks/list */
export async function listWorldBooks(): Promise<WorldBookListItem[]> {
  const res = await fetch(`${API_BASE_URL}/worldbooks/list`);
  if (!res.ok) throw new Error(`获取世界书列表失败: ${res.status}`);
  return res.json();
}

/** GET /worldbooks/:id */
export async function getWorldBook(id: string): Promise<WorldBookEntry> {
  const res = await fetch(`${API_BASE_URL}/worldbooks/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `获取世界书条目失败: ${res.status}`);
  }
  return res.json();
}

/** POST /worldbooks/create */
export async function createWorldBook(payload: WorldBookCreatePayload): Promise<WorldBookEntry> {
  const res = await fetch(`${API_BASE_URL}/worldbooks/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `创建世界书条目失败: ${res.status}`);
  }
  return res.json();
}

/** PUT /worldbooks/:id */
export async function updateWorldBook(id: string, payload: WorldBookUpdatePayload): Promise<WorldBookEntry> {
  const res = await fetch(`${API_BASE_URL}/worldbooks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `更新世界书条目失败: ${res.status}`);
  }
  return res.json();
}

/** DELETE /worldbooks/:id */
export async function deleteWorldBook(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/worldbooks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `删除世界书条目失败: ${res.status}`);
  }
  return res.json();
}
