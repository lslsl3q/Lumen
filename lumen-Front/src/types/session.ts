/**
 * 会话相关类型定义
 *
 * 对应后端 API 返回的数据结构
 */

/** 会话列表项 — GET /sessions/list 返回 */
export interface SessionListItem {
  session_id: string;       // "2026-04-16_143700" 格式
  character_id: string;
  created_at: string;       // ISO 格式
  message_count: number;
  title: string | null;
}

/** 历史消息元数据 — GET /chat/history 返回 */
export interface HistoryMessageMetadata {
  type?: 'normal' | 'reasoning' | 'tool_call' | 'tool_result' | 'tool_result_parallel' | 'system_feedback' | 'compact_summary';
  folded?: boolean;
  hidden?: boolean;
  internal?: boolean;
  vectorizable?: boolean;
  source_message_id?: number;
  event_id?: string;
  step_seq?: number;
  reasoning_content?: string;
  tool_name?: string;
  tool_count?: number;
  tool_command?: string;
  tool_params?: Record<string, unknown>;
  tool_call?: Record<string, unknown>;
  tool_calls?: Record<string, unknown>[];
  success?: boolean;
  error?: string;
}

/** 历史消息 — GET /chat/history 返回 */
export interface HistoryMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;  // 后端标记：true = 不应展示（防御纵深）
  metadata?: HistoryMessageMetadata;
}
