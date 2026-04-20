/**
 * 世界书类型定义
 */

export interface WorldBookEntry {
  id: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  secondary_keywords: string[];
  selective: boolean;
  selective_logic: 'and' | 'not';
  content: string;
  case_sensitive: boolean;
  whole_word: boolean;
  position: 'before_sys' | 'after_sys' | 'before_user' | 'after_user';
  depth: number;
  order: number;
  scan_depth: number;
  character_ids: string[];
  comment: string;
}

export interface WorldBookListItem {
  id: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  comment: string;
}

export type WorldBookCreatePayload = Omit<WorldBookEntry, 'id'> & { id?: string };

export type WorldBookUpdatePayload = Partial<Omit<WorldBookEntry, 'id'>>;
