/**
 * 聊天API客户端
 * 连接到FastAPI后端
 */
import { HistoryMessage } from '../types/session';

const API_BASE_URL = 'http://127.0.0.1:8888';

/**
 * SSE/WS 事件类型
 */
export interface StreamEvent {
  type: 'text' | 'status' | 'tool_start' | 'tool_result' | 'text_clear' | 'text_set' | 'think_start' | 'think_content' | 'think_end' | 'memory_debug' | 'react_trace' | 'rpg_state' | 'done' | 'error' | 'msg_saved' | 'theme_update';
  content?: string;
  status?: string;
  message?: string;
  tool?: string | string[];
  command?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  data?: unknown;
  error?: string;
  exit_reason?: string;
  mode?: string;
  // msg_saved 事件字段
  role?: string;
  db_id?: number;
  // done 事件额外字段
  assistant_db_id?: number;
  // 请求追踪：writing 消息回传 request_id
  request_id?: string;
  // memory_debug 事件字段
  layers?: { name: string; tokens: number; content: string }[];
  total_tokens?: number;
  context_size?: number;
  recall_log?: {
    keyword: string;
    source: string;
    results: number;
    tokens: number;
    method?: string;
    vector_count?: number;
    sparse_count?: number;
    graph_count?: number;
    messages: { role: string; content: string; session_id: string; created_at: string }[];
  }[];
  // react_trace 事件字段
  iteration?: number;
  action?: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'cancelled';
  duration_ms?: number;
  thinking?: string;
  // rpg_state 事件字段
  room_id?: string;
  room_name?: string;
  entities?: { id: string; name: string; hp: number; max_hp: number }[];
  cognitive_state?: {
    attention?: string;
    goals?: string[];
    emotions?: Record<string, number>;
    emotion_scores?: Record<string, number>;
    context_summary?: string;
  };
  // theme_update 事件字段
  theme_id?: string;
  tokens?: Record<string, string>;
}

/**
 * 获取会话聊天历史
 */
export async function getHistory(sessionId: string): Promise<{
  messages: HistoryMessage[];
}> {
  const res = await fetch(`${API_BASE_URL}/chat/history?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`获取历史失败: ${res.status}`);
  return res.json();
}

/**
 * 手动触发上下文压缩
 */
export async function compactSession(sessionId: string): Promise<{
  compacted: boolean;
  tokens_before: number;
  tokens_after: number;
  summary: string;
  reason?: string;
}> {
  const res = await fetch(`${API_BASE_URL}/chat/compact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `压缩失败: ${res.status}`);
  }
  return res.json();
}

/**
 * 获取 token 使用情况
 */
export async function getTokenUsage(sessionId: string): Promise<{
  current_tokens: number;
  context_size: number;
  usage_percent: number;
  threshold_percent: number;
  auto_compact: boolean;
  session_total_input: number;
  session_total_output: number;
}> {
  const res = await fetch(`${API_BASE_URL}/chat/token-usage?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`获取用量失败: ${res.status}`);
  return res.json();
}

/**
 * 编辑消息内容
 */
export async function editMessage(
  sessionId: string, messageId: number, content: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/chat/message`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message_id: messageId, content }),
  });
  if (!res.ok) throw new Error(`编辑消息失败: ${res.status}`);
  return res.json();
}

/**
 * 删除消息
 */
export async function deleteMessage(
  sessionId: string, messageId: number
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/chat/message`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message_id: messageId }),
  });
  if (!res.ok) throw new Error(`删除消息失败: ${res.status}`);
  return res.json();
}

/**
 * 重新生成 AI 回复
 * 删除该消息及之后的所有消息，返回对应的用户消息内容
 */
export async function regenerateMessage(
  sessionId: string, messageId: number
): Promise<{ user_message: string; session_id: string }> {
  const res = await fetch(`${API_BASE_URL}/chat/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message_id: messageId }),
  });
  if (!res.ok) throw new Error(`重新生成失败: ${res.status}`);
  return res.json();
}

/**
 * 创建分支会话
 * 基于指定消息及之前的消息创建新会话
 */
export async function branchSession(
  sessionId: string, messageId: number
): Promise<{ new_session_id: string; character_id: string }> {
  const res = await fetch(`${API_BASE_URL}/chat/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message_id: messageId }),
  });
  if (!res.ok) throw new Error(`创建分支失败: ${res.status}`);
  return res.json();
}
