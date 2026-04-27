/**
 * 日记/主动记忆 API 客户端
 *
 * 路由对应后端 /memories/* 三组资源：
 *   /memories/items/*   — 主动记忆 CRUD
 *   /memories/files/*   — 文件树浏览、文件读写
 *   /memories/folders/* — 文件夹管理
 */

const API_BASE_URL = 'http://127.0.0.1:8888';

export interface MemoryItem {
  memory_id: string;
  content: string;
  content_display: string;
  category: string;
  importance: number;
  tags: string[];
  md_path: string;
  created_at: string;
}

export interface MemoryFolder {
  name: string;
  path: string;
  files: { name: string; size: number; modified: number }[];
}

// ── 主动记忆 ──

export async function listMemories(
  characterId?: string,
  category?: string,
  limit?: number,
): Promise<MemoryItem[]> {
  const params = new URLSearchParams();
  if (characterId) params.set('character_id', characterId);
  if (category) params.set('category', category);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/memories/items${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`获取记忆列表失败: ${res.status}`);
  return res.json();
}

export async function searchMemories(
  query: string,
  characterId?: string,
  limit?: number,
): Promise<{ query: string; results: MemoryItem[]; total: number }> {
  const res = await fetch(`${API_BASE_URL}/memories/items/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, character_id: characterId || '', limit: limit || 10 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `搜索失败: ${res.status}`);
  }
  return res.json();
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/memories/items/${encodeURIComponent(memoryId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
}

// ── 文件管理 ──

export async function listMemoryFiles(): Promise<{ folders: MemoryFolder[] }> {
  const res = await fetch(`${API_BASE_URL}/memories/files`);
  if (!res.ok) throw new Error(`获取文件列表失败: ${res.status}`);
  return res.json();
}

export async function readMemoryFile(path: string): Promise<{ path: string; content: string }> {
  const res = await fetch(
    `${API_BASE_URL}/memories/files/content?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `读取文件失败: ${res.status}`);
  }
  return res.json();
}

export async function saveMemoryFile(path: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/memories/files/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `保存失败: ${res.status}`);
  }
}

// ── 文件夹管理 ──

export async function createFolder(name: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/memories/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `创建文件夹失败: ${res.status}`);
  }
}

export async function deleteFolder(name: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/memories/folders/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `删除文件夹失败: ${err.detail}`);
  }
}

export async function openFolder(name: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/memories/folders/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `打开失败: ${res.status}`);
  }
}
