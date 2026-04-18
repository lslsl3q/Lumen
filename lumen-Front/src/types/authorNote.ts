/** Author's Note 配置 */
export interface AuthorsNoteConfig {
  enabled: boolean;
  content: string;
  injection_position: 'before_user' | 'after_user';
}

/** 更新请求（所有字段可选） */
export interface AuthorsNoteUpdatePayload {
  enabled?: boolean;
  content?: string;
  injection_position?: 'before_user' | 'after_user';
}
