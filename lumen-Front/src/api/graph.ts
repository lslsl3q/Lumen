/**
 * 图谱 API 客户端
 * 实体和边的 CRUD 操作，通用支持任意 TDB
 */

const API_BASE_URL = 'http://127.0.0.1:8888';

export interface GraphEntity {
  id: number;
  payload: Record<string, unknown>;
}

export interface GraphEdge {
  src: number;
  src_name: string;
  dst: number;
  dst_name: string;
}

export interface Neighbor {
  id: number;
  payload: Record<string, unknown>;
}

// ── 实体 ──

export async function listEntities(
  tdb: string,
  type?: string,
): Promise<{ entities: GraphEntity[]; total: number }> {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/entities?${qs}`);
  if (!res.ok) throw new Error(`查询实体失败: ${res.statusText}`);
  return res.json();
}

export async function createEntity(
  tdb: string,
  name: string,
  type = 'entity',
  extra: Record<string, unknown> = {},
): Promise<{ id: number; payload: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/entities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, extra }),
  });
  if (!res.ok) throw new Error(`创建实体失败: ${res.statusText}`);
  return res.json();
}

export async function updateEntity(
  tdb: string,
  id: number,
  payload: Record<string, unknown>,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/entities/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error(`更新实体失败: ${res.statusText}`);
  return res.json();
}

export async function deleteEntity(
  tdb: string,
  id: number,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/entities/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除实体失败: ${res.statusText}`);
  return res.json();
}

// ── 边 ──

export async function listEdges(
  tdb: string,
): Promise<{ edges: GraphEdge[]; total: number }> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/edges`);
  if (!res.ok) throw new Error(`查询边失败: ${res.statusText}`);
  return res.json();
}

export async function createEdge(
  tdb: string,
  src: number,
  dst: number,
  label = 'related',
  weight = 1.0,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src, dst, label, weight }),
  });
  if (!res.ok) throw new Error(`创建边失败: ${res.statusText}`);
  return res.json();
}

export async function deleteEdge(
  tdb: string,
  src: number,
  dst: number,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/edges/${src}/${dst}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除边失败: ${res.statusText}`);
  return res.json();
}

// ── 邻居查询 ──

export async function getNeighbors(
  tdb: string,
  nodeId: number,
  depth = 1,
): Promise<{ node_id: number; depth: number; neighbors: Neighbor[] }> {
  const res = await fetch(
    `${API_BASE_URL}/graph/${tdb}/neighbors/${nodeId}?depth=${depth}`,
  );
  if (!res.ok) throw new Error(`邻居查询失败: ${res.statusText}`);
  return res.json();
}

// ── 图谱重抽 ──

export interface ReExtractResult {
  success: boolean;
  files_processed: number;
  total_files: number;
  total_entities: number;
  total_edges: number;
  errors: string[];
}

export async function reExtractGraph(
  tdb: string,
  sourcePath = '',
): Promise<ReExtractResult> {
  const res = await fetch(`${API_BASE_URL}/graph/${tdb}/re-extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_path: sourcePath }),
  });
  if (!res.ok) throw new Error(`图谱重抽失败: ${res.statusText}`);
  return res.json();
}

// ── 图谱提示词 ──

const CONFIG_BASE_URL = 'http://127.0.0.1:8888/config';

export interface GraphPrompt {
  system_prompt: string;
  user_template: string;
  raw_content: string;
}

export async function getGraphPrompt(): Promise<GraphPrompt> {
  const res = await fetch(`${CONFIG_BASE_URL}/graph-prompt`);
  if (!res.ok) throw new Error(`读取图谱提示词失败: ${res.statusText}`);
  return res.json();
}

export async function updateGraphPrompt(content: string): Promise<{ message: string }> {
  const res = await fetch(`${CONFIG_BASE_URL}/graph-prompt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`保存图谱提示词失败: ${res.statusText}`);
  return res.json();
}
