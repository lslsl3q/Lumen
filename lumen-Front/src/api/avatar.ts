/**
 * 头像管理 API 客户端
 */
import type { AvatarItem, AvatarUploadResponse } from '../types/avatar';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /avatars/list - 获取所有头像列表 */
export async function listAvatars(): Promise<AvatarItem[]> {
  const res = await fetch(`${API_BASE_URL}/avatars/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `获取头像列表失败: ${res.status}`);
  }
  return res.json();
}

/** POST /avatars/upload - 上传头像 */
export async function uploadAvatar(file: File): Promise<AvatarUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/avatars/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `上传头像失败: ${res.status}`);
  }
  return res.json();
}

/** DELETE /avatars/:id - 删除头像 */
export async function deleteAvatar(avatarId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/avatars/${encodeURIComponent(avatarId)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `删除头像失败: ${res.status}`);
  }
  return res.json();
}
