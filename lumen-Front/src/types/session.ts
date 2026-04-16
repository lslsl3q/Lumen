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
}

/** 历史消息 — GET /chat/history 返回 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
