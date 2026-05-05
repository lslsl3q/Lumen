/**
 * URL 构造工具
 */

const API_BASE_URL = 'http://127.0.0.1:8888';

/** 获取头像 URL */
export function getAvatarUrl(avatar?: string | null): string | null {
  if (!avatar) return null;
  return `${API_BASE_URL}/avatars/${avatar}`;
}
