/**
 * Skills API 客户端
 */
import type { SkillCard, SkillCreatePayload, SkillUpdatePayload } from '../types/skills';

const API_BASE_URL = 'http://127.0.0.1:8888';

export async function listSkills(): Promise<SkillCard[]> {
  const res = await fetch(`${API_BASE_URL}/skills/list`);
  if (!res.ok) throw new Error(`获取 Skill 列表失败: ${res.status}`);
  return res.json();
}

export async function getSkill(id: string): Promise<SkillCard> {
  const res = await fetch(`${API_BASE_URL}/skills/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`获取 Skill 失败: ${res.status}`);
  return res.json();
}

export async function createSkill(payload: SkillCreatePayload): Promise<SkillCard> {
  const res = await fetch(`${API_BASE_URL}/skills/create`, {
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

export async function updateSkill(id: string, payload: SkillUpdatePayload): Promise<SkillCard> {
  const res = await fetch(`${API_BASE_URL}/skills/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `更新失败: ${res.status}`);
  }
  return res.json();
}

export async function deleteSkill(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
}
