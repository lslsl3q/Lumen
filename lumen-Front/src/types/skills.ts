/**
 * Skills 类型定义
 */

export interface SkillCard {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillCreatePayload {
  id?: string;
  name: string;
  description?: string;
  content?: string;
  enabled?: boolean;
}

export interface SkillUpdatePayload {
  name?: string;
  description?: string;
  content?: string;
  enabled?: boolean;
}
