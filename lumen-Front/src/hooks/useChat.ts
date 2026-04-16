/**
 * 聊天状态管理Hook — 流式版 + 会话支持
 *
 * 职责：管理消息列表、流式接收状态、工具调用追踪、会话历史加载
 * 遵循单向依赖：hook → api/chat.ts + api/session.ts，不直接操作 DOM 或 SSE
 */
import { useState, useCallback } from 'react';
import { sendMessageStream, getHistory, StreamEvent } from '../api/chat';
import { createSession } from '../api/session';
import { HistoryMessage } from '../types/session';

/** 工具调用追踪 */
export interface ToolCall {
  name: string;
  status: 'running' | 'done';
  success?: boolean;
  params?: Record<string, unknown>;
  error?: string;
}

/** 消息 */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

/** 生成唯一消息 ID */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 欢迎消息 */
const WELCOME_MESSAGE: Message = {
  id: 'msg_init',
  role: 'assistant',
  content: '你好！我是 Lumen AI，有什么可以帮你的吗？',
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  /** 加载指定会话的历史消息 */
  const loadHistory = useCallback(async (sessionId: string) => {
    try {
      const data = await getHistory(sessionId);
      const historyMessages: Message[] = data.messages.map((msg: HistoryMessage, i: number) => ({
        id: `hist_${sessionId}_${i}`,
        role: msg.role,
        content: msg.content,
      }));
      setMessages(historyMessages.length > 0 ? historyMessages : [WELCOME_MESSAGE]);
      setCurrentSessionId(sessionId);
      setError(null);
    } catch (err) {
      console.error('加载历史失败:', err);
      setError('加载历史失败');
    }
  }, []);

  /** 清空前端消息（准备新会话），不调 API */
  const clearMessages = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setCurrentSessionId(null);
    setError(null);
  }, []);

  /** 发送消息（核心逻辑） */
  const sendMessageToAPI = useCallback(async (messageContent: string) => {
    if (!messageContent.trim()) return;

    // 如果还没有会话，先自动创建一个
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const data = await createSession();
        sessionId = data.session_id;
        setCurrentSessionId(sessionId);
      } catch (err) {
        console.error('自动创建会话失败:', err);
        setError('创建会话失败');
        return;
      }
    }

    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: messageContent,
    };

    const assistantId = generateMessageId();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };

    // 立即追加用户消息 + 空的 AI 消息（占位，准备流式填充）
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      await sendMessageStream(
        messageContent,
        // onText: 逐 token 追加到 AI 消息
        (text) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.id === assistantId) {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        },
        // onEvent: 处理工具事件和生命周期
        (event: StreamEvent) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.id !== assistantId) return prev;

            switch (event.type) {
              case 'tool_start': {
                const raw = event.tool;
                const toolNames = (Array.isArray(raw) ? raw : [raw]).filter((n): n is string => typeof n === 'string');
                const newCalls: ToolCall[] = toolNames.map(name => ({
                  name,
                  status: 'running' as const,
                  params: event.params,
                }));
                return [
                  ...updated.slice(0, -1),
                  { ...last, toolCalls: [...(last.toolCalls || []), ...newCalls] },
                ];
              }
              case 'tool_result': {
                const calls = [...(last.toolCalls || [])];
                const idx = calls.findIndex(c => c.name === event.tool && c.status === 'running');
                if (idx !== -1) {
                  calls[idx] = { ...calls[idx], status: 'done', success: event.success, error: event.error };
                }
                return [...updated.slice(0, -1), { ...last, toolCalls: calls }];
              }
              case 'done': {
                return [...updated.slice(0, -1), { ...last, isStreaming: false }];
              }
              default:
                return prev;
            }
          });
        },
        // sessionId
        sessionId
      );
    } catch (err) {
      console.error('Stream failed:', err);
      // 出错时：如果 AI 消息还是空的，就删掉它；如果已有部分文本，保留
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.id === assistantId && !last.content) {
          return updated.slice(0, -1);
        }
        if (last.id === assistantId) {
          updated[updated.length - 1] = { ...last, isStreaming: false };
        }
        return updated;
      });
      setError('流式连接失败，请检查后端是否启动');
      setInput(messageContent);
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId]);

  /** 重置聊天（前端清空） */
  const resetChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    input,
    setInput,
    sendMessage: sendMessageToAPI,
    resetChat,
    loadHistory,
    clearMessages,
    currentSessionId,
    setCurrentSessionId,
    error,
  };
}
