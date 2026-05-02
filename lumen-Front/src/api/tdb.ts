/**
 * TDB 条目浏览/编辑 API
 */
const API_BASE_URL = 'http://127.0.0.1:8888';

export interface TdbInfo {
  name: string;
  filename: string | null;
  size: number;
}

export async function listTdbs(): Promise<{ tdbs: TdbInfo[] }> {
  const res = await fetch(`${API_BASE_URL}/config/tdbs`);
  if (!res.ok) throw new Error(`获取 TDB 列表失败: ${res.status}`);
  return res.json();
}

export interface TdbEntry {
  id: number | null;
  content: string;
  source: string;
  category: string;
  keywords: string[];
  tags: string[];
  importance: number;
  status: string;
  session_id: string;
  character_id: string;
  created_at: string;
  role: string;
  message_id: number | null;
  source_path: string;
  filename: string;
}

export interface TdbStats {
  total: number;
  sources: Record<string, number>;
  categories: Record<string, number>;
  statuses: Record<string, number>;
}

export interface TdbEntryUpdate {
  content?: string;
  source?: string;
  category?: string;
  tags?: string[];
  importance?: number;
  reindex?: boolean;
}

export async function listTdbEntries(params: {
  name: string;
  source?: string;
  category?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: TdbEntry[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.source) sp.set('source', params.source);
  if (params.category) sp.set('category', params.category);
  if (params.status) sp.set('status', params.status);
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  const res = await fetch(`${API_BASE_URL}/tdb/${params.name}/entries?${sp}`);
  if (!res.ok) throw new Error(`查询失败: ${res.status}`);
  return res.json();
}

export async function getTdbStats(name: string): Promise<TdbStats> {
  const res = await fetch(`${API_BASE_URL}/tdb/${name}/stats`);
  if (!res.ok) throw new Error(`统计失败: ${res.status}`);
  return res.json();
}

export async function updateTdbEntry(
  name: string,
  entryId: number,
  body: TdbEntryUpdate,
): Promise<{ id: number; updated: boolean }> {
  const res = await fetch(`${API_BASE_URL}/tdb/${name}/entries/${entryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`更新失败: ${res.status}`);
  return res.json();
}

export interface TdbFileFolder {
  name: string;
  path: string;
  files: { name: string; path: string }[];
}

export async function getTdbFileTree(name: string): Promise<{
  folders: TdbFileFolder[];
  total_files: number;
}> {
  const res = await fetch(`${API_BASE_URL}/tdb/${name}/file-tree`);
  if (!res.ok) throw new Error(`目录树失败: ${res.status}`);
  return res.json();
}

export async function importTdbFile(
  name: string,
  path: string,
): Promise<{ success: boolean; file_id: string; chunks: number; reimported?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/tdb/${name}/import-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`导入失败: ${res.status}`);
  return res.json();
}
