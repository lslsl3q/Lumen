/**
 * 缓冲区 API 客户端
 * 记忆缓冲区管理：列表、搜索、确认、丢弃、整理、设置、TDB 列表
 */

const API_BASE_URL = 'http://127.0.0.1:8888';

export interface BufferItem {
  id: number;
  content: string;
  source: string;
  session_id: string;
  character_id: string;
  keywords: string[];
  importance: number;
  category: string;
  status: 'pending' | 'confirmed' | 'discarded';
  created_at: string;
}

export interface BufferStats {
  enabled: boolean;
  total: number;
  pending: number;
  confirmed: number;
  discarded: number;
  sources: Record<string, number>;
}

export interface BufferSearchResult extends BufferItem {
  score: number;
  buffer_source: string;
}

export interface BufferSettings {
  buffer_enabled: boolean;
  buffer_auto_cleanup: boolean;
  buffer_auto_consolidate_threshold: number;
  buffer_consolidation_model: string;
}

export interface TdbInfo {
  name: string;
  filename: string | null;
  size: number;
}

/**
 * 获取缓冲区统计
 */
export async function getBufferStats(): Promise<BufferStats> {
  const res = await fetch(`${API_BASE_URL}/buffer/stats`);
  if (!res.ok) throw new Error(`缓冲区统计失败: ${res.statusText}`);
  return res.json();
}

/**
 * 列出缓冲区条目
 */
export async function listBufferItems(params?: {
  status?: string;
  limit?: number;
  offset?: number;
  character_id?: string;
}): Promise<{ items: BufferItem[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.character_id) qs.set('character_id', params.character_id);

  const res = await fetch(`${API_BASE_URL}/buffer/items?${qs}`);
  if (!res.ok) throw new Error(`缓冲区列表失败: ${res.statusText}`);
  return res.json();
}

/**
 * 搜索缓冲区
 */
export async function searchBuffer(
  query: string,
  topK = 5,
  characterId = '',
): Promise<{ query: string; results: BufferSearchResult[]; total: number }> {
  const qs = new URLSearchParams({ q: query, top_k: String(topK) });
  if (characterId) qs.set('character_id', characterId);

  const res = await fetch(`${API_BASE_URL}/buffer/search?${qs}`);
  if (!res.ok) throw new Error(`缓冲区搜索失败: ${res.statusText}`);
  return res.json();
}

/**
 * 批量整理（小模型向量 → 大模型向量，写入正式库）
 */
export async function consolidateBuffer(ids?: number[]): Promise<{
  confirmed: number;
  failed: number;
}> {
  const res = await fetch(`${API_BASE_URL}/buffer/consolidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : {}),
  });
  if (!res.ok) throw new Error(`缓冲区整理失败: ${res.statusText}`);
  return res.json();
}

/**
 * 确认单条（大模型重算向量后写入目标 TDB）
 */
export async function confirmBufferItem(nodeId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/buffer/confirm/${nodeId}`, { method: 'POST' });
  if (!res.ok) throw new Error(`确认失败: ${res.statusText}`);
  return res.json();
}

/**
 * 丢弃一条缓冲区记录
 */
export async function discardBufferItem(nodeId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/buffer/items/${nodeId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`丢弃失败: ${res.statusText}`);
  return res.json();
}

/**
 * 清理已确认/已丢弃的条目
 */
export async function cleanupBuffer(): Promise<{ message: string; count: number }> {
  const res = await fetch(`${API_BASE_URL}/buffer/cleanup`, { method: 'POST' });
  if (!res.ok) throw new Error(`清理失败: ${res.statusText}`);
  return res.json();
}

// ========================================
// 设置 API（/config/buffer）
// ========================================

/**
 * 获取缓冲区设置 + 统计
 */
export async function getBufferSettings(): Promise<{
  settings: BufferSettings;
  stats: BufferStats;
}> {
  const res = await fetch(`${API_BASE_URL}/config/buffer`);
  if (!res.ok) throw new Error(`获取缓冲区设置失败: ${res.statusText}`);
  return res.json();
}

/**
 * 更新缓冲区设置
 */
export async function updateBufferSettings(
  updates: Partial<BufferSettings>,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/config/buffer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`更新设置失败: ${res.statusText}`);
  return res.json();
}

/**
 * 切换缓冲区开关
 */
export async function toggleBuffer(
  enabled: boolean,
): Promise<{ message: string; enabled: boolean }> {
  const res = await fetch(`${API_BASE_URL}/config/buffer/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`切换缓冲区失败: ${res.statusText}`);
  return res.json();
}

// ========================================
// 条目编辑 API
// ========================================

/**
 * 更新缓冲区条目内容（保存编辑，不影响审批状态）
 */
export async function updateBufferItem(
  nodeId: number,
  data: {
    content?: string;
    category?: string;
    tags?: string[];
    importance?: number;
  },
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/buffer/items/${nodeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`更新条目失败: ${res.statusText}`);
  return res.json();
}

// ========================================
// TDB 列表 API
// ========================================

/**
 * 获取用户可见的 TDB 列表（动态，用于编辑器标签页）
 */
export async function listTdbs(): Promise<{ tdbs: TdbInfo[] }> {
  const res = await fetch(`${API_BASE_URL}/config/tdbs`);
  if (!res.ok) throw new Error(`获取 TDB 列表失败: ${res.statusText}`);
  return res.json();
}
