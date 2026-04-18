/**
 * 头像管理类型定义
 */

export interface AvatarItem {
  id: string;
  filename: string;
  url: string;
  size: number;
  created_at: number;
}

export interface AvatarUploadResponse {
  id: string;
  filename: string;
  url: string;
  size: number;
}
