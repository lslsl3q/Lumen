/**
 * 聊天API客户端
 * 连接到FastAPI后端
 */

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
 * 流式发送聊天消息（预留接口）
 */
export async function sendMessageStream(
  message: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
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
            const parsed = JSON.parse(data);
            onChunk(parsed.content || parsed.text || '');
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
