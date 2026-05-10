/**
 * 重排序服务 API 客户端
 *
 * 多服务商管理：增删改查、切换活跃、测试连接、全局开关和参数调整
 */
const API_BASE = 'http://127.0.0.1:8888/rerank';

export interface Provider {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  model: string;
  max_doc_chars: number;
}

export interface RerankStatus {
  enabled: boolean;
  active_provider_id: string;
  active_provider_name: string;
  top_k: number;
  min_score: number;
  provider_count: number;
}

export interface TestResult {
  success: boolean;
  latency_ms?: number;
  results?: Array<{ index: number; relevance_score: number }>;
  usage?: Record<string, number>;
  error?: string;
}

/** GET /rerank/status */
export async function getRerankStatus(): Promise<RerankStatus> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`获取重排状态失败: ${res.status}`);
  return res.json();
}

/** GET /rerank/providers */
export async function getProviders(): Promise<Provider[]> {
  const res = await fetch(`${API_BASE}/providers`);
  if (!res.ok) throw new Error(`获取服务商列表失败: ${res.status}`);
  const data = await res.json();
  return data.providers ?? data;
}

/** POST /rerank/providers */
export async function addProvider(data: Omit<Provider, 'id'>): Promise<Provider> {
  const res = await fetch(`${API_BASE}/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`添加服务商失败: ${res.status}`);
  return res.json();
}

/** PUT /rerank/providers/{id} */
export async function updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
  const res = await fetch(`${API_BASE}/providers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`更新服务商失败: ${res.status}`);
  return res.json();
}

/** DELETE /rerank/providers/{id} */
export async function deleteProvider(id: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除服务商失败: ${res.status}`);
  return res.json();
}

/** PUT /rerank/active */
export async function setActiveProvider(providerId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider_id: providerId }),
  });
  if (!res.ok) throw new Error(`切换服务商失败: ${res.status}`);
  return res.json();
}

/** PUT /rerank/settings */
export async function updateSettings(data: {
  enabled?: boolean;
  top_k?: number;
  min_score?: number;
}): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`更新设置失败: ${res.status}`);
  return res.json();
}

/** POST /rerank/test */
export async function testConnection(providerId?: string): Promise<TestResult> {
  const res = await fetch(`${API_BASE}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(providerId ? { provider_id: providerId } : {}),
  });
  if (!res.ok) throw new Error(`测试连接失败: ${res.status}`);
  return res.json();
}
