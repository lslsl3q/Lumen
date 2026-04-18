/**
 * 角色管理 API 客户端
 *
 * 对接后端 /characters/* 端点
 * 纯 HTTP 请求，不含状态逻辑
 */
import { CharacterListItem, CharacterDetail, CharacterFormData } from '../types/character';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /characters/list — 获取所有角色列表 */
export async function listCharacters(): Promise<CharacterListItem[]> {
  const res = await fetch(`${API_BASE_URL}/characters/list`);
  if (!res.ok) throw new Error(`获取角色列表失败: ${res.status}`);
  return res.json();
}

/** GET /characters/{id} — 获取角色详情 */
export async function getCharacter(id: string): Promise<CharacterDetail> {
  const res = await fetch(`${API_BASE_URL}/characters/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`获取角色详情失败: ${res.status}`);
  return res.json();
}

/** POST /characters/create — 创建角色（multipart/form-data） */
export async function createCharacter(
  data: CharacterFormData,
  avatarFile?: File,
): Promise<{ message: string; character: CharacterDetail & { id: string } }> {
  const formData = new FormData();
  // 不再添加 character_id，让后端自动生成
  formData.append('data', JSON.stringify(data));
  if (avatarFile) {
    formData.append('avatar', avatarFile);
  }

  const res = await fetch(`${API_BASE_URL}/characters/create`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `创建角色失败: ${res.status}`);
  }
  return res.json();
}

/** PUT /characters/{id} — 更新角色（multipart/form-data） */
export async function updateCharacter(
  id: string,
  data: Partial<CharacterFormData>,
  avatarFile?: File,
): Promise<{ message: string; character: CharacterDetail }> {
  const formData = new FormData();
  formData.append('data', JSON.stringify(data));
  if (avatarFile) {
    formData.append('avatar', avatarFile);
  }

  const res = await fetch(`${API_BASE_URL}/characters/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `更新角色失败: ${res.status}`);
  }
  return res.json();
}

/** DELETE /characters/{id} — 删除角色 */
export async function deleteCharacter(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/characters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `删除角色失败: ${res.status}`);
  }
  return res.json();
}

/** POST /characters/switch — 切换当前会话角色 */
export async function switchCharacter(
  characterId: string,
  sessionId: string,
): Promise<{ message: string; character_id: string; session_id: string }> {
  const res = await fetch(`${API_BASE_URL}/characters/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: characterId, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`切换角色失败: ${res.status}`);
  return res.json();
}

/** 获取头像 URL */
export function getAvatarUrl(avatar?: string | null): string | null {
  if (!avatar) return null;
  return `${API_BASE_URL}/avatars/${avatar}`;
}
