/**
 * 知识库 API 客户端
 */
import type { KnowledgeFile, KnowledgeCreatePayload, KnowledgeSearchResponse } from '../types/knowledge';

const API_BASE_URL = 'http://127.0.0.1:8888';

export async function listKnowledgeFiles(category?: string): Promise<KnowledgeFile[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`${API_BASE_URL}/knowledge/list${params}`);
  if (!res.ok) throw new Error(`获取知识库列表失败: ${res.status}`);
  return res.json();
}

export async function getKnowledgeFile(fileId: string): Promise<KnowledgeFile> {
  const res = await fetch(`${API_BASE_URL}/knowledge/${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(`获取文件失败: ${res.status}`);
  return res.json();
}

export async function createKnowledgeEntry(payload: KnowledgeCreatePayload): Promise<KnowledgeFile> {
  const res = await fetch(`${API_BASE_URL}/knowledge/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `创建失败: ${res.status}`);
  }
  return res.json();
}

export async function uploadKnowledgeFile(
  file: File,
  category: string = 'imports',
  subdir: string = '',
): Promise<KnowledgeFile> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  formData.append('subdir', subdir);
  const res = await fetch(`${API_BASE_URL}/knowledge/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `上传失败: ${res.status}`);
  }
  return res.json();
}

export async function searchKnowledge(
  query: string,
  topK: number = 5,
  minScore: number = 0.3,
  category?: string,
): Promise<KnowledgeSearchResponse> {
  const res = await fetch(`${API_BASE_URL}/knowledge/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK, min_score: minScore, category }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `搜索失败: ${res.status}`);
  }
  return res.json();
}

export async function deleteKnowledgeFile(fileId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/knowledge/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
}

// ── T23 动态知识库 ──

// 扫描变更
export async function scanKnowledge() {
  const res = await fetch(`${API_BASE_URL}/knowledge/scan`);
  if (!res.ok) throw new Error('扫描失败');
  return res.json();
}

// 确认处理变更
export async function applyScanChanges(changes: {
  register_kbs?: string[];
  added?: Array<{ kb: string; path: string; md5: string }>;
  modified?: Array<{ kb: string; path: string; file_id: string }>;
  deleted?: Array<{ kb: string; path: string; file_id: string }>;
}) {
  const res = await fetch(`${API_BASE_URL}/knowledge/scan/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error('处理变更失败');
  return res.json();
}

// 知识库管理
export async function listKnowledgeBases() {
  const res = await fetch(`${API_BASE_URL}/knowledge/bases`);
  if (!res.ok) throw new Error('获取知识库列表失败');
  return res.json();
}

export async function createKnowledgeBase(name: string) {
  const res = await fetch(`${API_BASE_URL}/knowledge/bases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('创建知识库失败');
  return res.json();
}

export async function deleteKnowledgeBase(name: string) {
  const res = await fetch(`${API_BASE_URL}/knowledge/bases/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除知识库失败');
  return res.json();
}

// 图谱同步
export async function syncGraph(kb?: string) {
  const res = await fetch(`${API_BASE_URL}/knowledge/graph/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kb }),
  });
  if (!res.ok) throw new Error('图谱同步失败');
  return res.json();
}
