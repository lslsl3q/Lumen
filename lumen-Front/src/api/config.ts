/**
 * 配置管理 API 客户端
 *
 * 对接后端 /config/* 端点
 * 纯 HTTP 请求，不含状态逻辑
 */
import { ConfigItem, ConfigDetail, ConfigUpdatePayload } from '../types/config';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /config/list — 获取所有配置项列表 */
export async function listConfigs(): Promise<ConfigItem[]> {
  const res = await fetch(`${API_BASE_URL}/config/list`);
  if (!res.ok) throw new Error(`获取配置列表失败: ${res.status}`);
  return res.json();
}

/** GET /config/{resource} — 获取配置详情 */
export async function getConfig(resource: string): Promise<ConfigDetail> {
  const res = await fetch(`${API_BASE_URL}/config/${encodeURIComponent(resource)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `获取配置失败: ${res.status}`);
  }
  return res.json();
}

/** POST /config/{resource} — 更新配置 */
export async function updateConfig(
  resource: string,
  payload: ConfigUpdatePayload,
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/config/${encodeURIComponent(resource)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `更新配置失败: ${res.status}`);
  }
  return res.json();
}
