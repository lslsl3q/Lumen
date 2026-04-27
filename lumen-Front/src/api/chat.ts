/**
 * 聊天API客户端
 * 连接到FastAPI后端
 */
import { HistoryMessage } from '../types/session';

const API_BASE_URL = 'http://127.0.0.1:8888';

export interface ChatResponse {
  reply: string;
  session_id: string;
}

export interface Message {
  id: string;              // 唯一标识
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 发送聊天消息
 */
export async function sendMessage(message: string): Promise<ChatResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const data: ChatResponse = await response.json();
    return data;
  } catch (error) {
    console.error('发送消息失败:', error);
    throw error;
  }
}

/**
 * SSE 事件类型
 */
export interface StreamEvent {
  type: 'text' | 'status' | 'tool_start' | 'tool_result' | 'text_clear' | 'text_set' | 'think_start' | 'think_content' | 'think_end' | 'memory_debug' | 'react_trace' | 'done' | 'error' | 'msg_saved';
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
  // memory_debug 事件字段
  layers?: { name: string; tokens: number; content: string }[];
  total_tokens?: number;
  context_size?: number;
  recall_log?: {
    keyword: string;
    source: string;
    results: number;
    tokens: number;
    messages: { role: string; content: string; session_id: string; created_at: string }[];
  }[];
  // react_trace 事件字段
  iteration?: number;
  action?: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'cancelled';
  duration_ms?: number;
  thinking?: string;
}

/**
 * 流式发送聊天消息
 *
 * 后端返回结构化事件流：
 * - text:       文本片段，拼接到回复中
 * - status:     状态变化（thinking / tool_error / max_iterations）
 * - tool_start: 工具开始执行
 * - tool_result: 工具执行结果
 * - done:       流式结束，携带 exit_reason
 * - error:      错误信息
 */
export async function sendMessageStream(
  message: string,
  onText: (text: string) => void,
  onEvent?: (event: StreamEvent) => void,
  sessionId?: string,
  signal?: AbortSignal,
  memoryDebugMode?: boolean,
  responseStyle?: string,
): Promise<void> {
  try {
    console.log('[API] 发送流式消息请求:', { message, sessionId, memoryDebugMode, responseStyle });

    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, session_id: sessionId || 'default', memory_debug: memoryDebugMode || false, response_style: responseStyle || 'balanced' }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '未知错误');
      console.error('[API] 请求失败:', response.status, errorText);
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error('[API] 无法获取响应流');
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[API] 流式接收完成，共接收', eventCount, '个事件');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('[API] 接收结束信号');
            continue;
          }
          try {
            const event: StreamEvent = JSON.parse(data);
            eventCount++;

            // 记录工具调用相关事件
            if (event.type === 'tool_start') {
              console.log('[API] 工具开始:', event.tool, event.params);
            } else if (event.type === 'tool_result') {
              console.log('[API] 工具结果:', event.tool, event.success ? '成功' : '失败');
            } else if (event.type === 'error') {
              console.error('[API] 错误事件:', event.message);
            }

            // 文本事件 → 拼接到回复
            if (event.type === 'text' && event.content) {
              onText(event.content);
            }
            // 所有事件都通知上层（用于未来 UI 展示工具状态）
            onEvent?.(event);
          } catch (e) {
            console.warn('[API] 事件解析失败:', data, e);
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('[API] 请求被用户取消');
      throw error;
    }
    console.error('[API] 流式发送失败:', error);
    throw error;
  }
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
 * 中断指定会话的流式生成
 */
export async function cancelChat(sessionId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/chat/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
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
