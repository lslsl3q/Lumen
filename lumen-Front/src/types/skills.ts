/**
 * Skills 类型定义
 */

export interface SkillCard {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  when_to_use: string;
  allowed_tools: string[];
  argument_hint: string;
  priority: number;
  script: string;
}

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  when_to_use: string;
  priority: number;
  script: string;
}

export interface SkillCreatePayload {
  id?: string;
  name: string;
  description?: string;
  content?: string;
  enabled?: boolean;
  when_to_use?: string;
  allowed_tools?: string[];
  argument_hint?: string;
  priority?: number;
  script?: string;
}

export interface SkillUpdatePayload {
  name?: string;
  description?: string;
  content?: string;
  enabled?: boolean;
  when_to_use?: string;
  allowed_tools?: string[];
  argument_hint?: string;
  priority?: number;
  script?: string;
}
