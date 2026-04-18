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
  type: 'text' | 'status' | 'tool_start' | 'tool_result' | 'text_clear' | 'done' | 'error';
  content?: string;
  status?: string;
  message?: string;
  tool?: string | string[];
  params?: Record<string, unknown>;
  success?: boolean;
  data?: unknown;
  error?: string;
  exit_reason?: string;
  mode?: string;
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
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, session_id: sessionId || 'default' }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const event: StreamEvent = JSON.parse(data);
            // 文本事件 → 拼接到回复
            if (event.type === 'text' && event.content) {
              onText(event.content);
            }
            // 所有事件都通知上层（用于未来 UI 展示工具状态）
            onEvent?.(event);
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error('流式发送失败:', error);
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
