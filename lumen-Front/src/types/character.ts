/**
 * 角色相关类型定义
 *
 * 对应后端 API 返回的数据结构
 */

/** 角色列表项 — GET /characters/list 返回 */
export interface CharacterListItem {
  id: string;
  name: string;
  display_name: string;
  avatar?: string;
  description?: string;
  tools: string[];
}

/** 角色详情 — GET /characters/{id} 返回 */
export interface CharacterDetail {
  id: string;
  name: string;
  description?: string;
  greeting?: string;
  system_prompt?: string;
  avatar?: string;
  tools: string[];
  tool_tips?: Record<string, string>;
  model?: string;
  context_size?: number;
  auto_compact: boolean;
  compact_threshold: number;
  memory_enabled?: boolean;
  memory_token_budget?: number;
  memory_auto_summarize?: boolean;
  skills?: string[];
}

/** 创建/编辑角色的表单数据 */
export interface CharacterFormData {
  name: string;
  description?: string;
  system_prompt?: string;
  greeting?: string;
  tools?: string[];
  tool_tips?: Record<string, string>;
  model?: string;
  context_size?: number;
  auto_compact?: boolean;
  compact_threshold?: number;
  memory_enabled?: boolean;
  memory_token_budget?: number;
  memory_auto_summarize?: boolean;
  skills?: string[];
}
