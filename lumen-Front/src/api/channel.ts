/**
 * Channel REST API 客户端（T26: Session→Channel 迁移）
 */

const API_BASE_URL = 'http://127.0.0.1:8888';

export interface ChannelInfo {
  id: string;
  name: string;
  type: 'chat' | 'rpg' | 'board' | 'manage';
  description: string;
  order: number;
  group: 'base' | 'adventure' | 'free' | 'manage';
  created_at: string;
  updated_at: string;
}

export interface ChannelMessageInfo {
  id: number;
  role: string;
  content: string;
  channel_id: string;
  session_id: string;
  created_at: string;
}

export async function listChannels(): Promise<ChannelInfo[]> {
  const res = await fetch(`${API_BASE_URL}/channels`);
  if (!res.ok) throw new Error(`获取频道列表失败: ${res.status}`);
  return res.json();
}

export async function createChannel(
  name: string, type: string, description: string = '', group: string = 'base'
): Promise<{ channel_id: string }> {
  const res = await fetch(`${API_BASE_URL}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, description, group }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `创建频道失败: ${res.status}`);
  }
  return res.json();
}

export async function deleteChannel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/channels/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除频道失败: ${res.status}`);
}

export async function getChannelMessages(
  channelId: string, limit: number = 50, sinceId?: number
): Promise<ChannelMessageInfo[]> {
  let url = `${API_BASE_URL}/channels/${channelId}/messages?limit=${limit}`;
  if (sinceId) url += `&since_id=${sinceId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`获取频道消息失败: ${res.status}`);
  return res.json();
}
