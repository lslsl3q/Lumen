/**
 * 聊天状态管理Hook — Steps 结构化版
 *
 * 核心变更：Assistant 消息从扁平字段 (content/toolCalls/thinkingContent)
 * 改为有序 steps 数组，每个 step 是一个独立视觉阶段（思考/工具/文本）。
 * 后端零改动，前端从现有 SSE 事件构建 steps。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { sendMessageStream, getHistory, cancelChat, editMessage as editMessageAPI, deleteMessage as deleteMessageAPI, regenerateMessage as regenerateMessageAPI, branchSession as branchSessionAPI, StreamEvent } from '../api/chat';
import { createSession } from '../api/session';
import { HistoryMessage } from '../types/session';
import { toast } from '../utils/toast';

// ── Steps 类型定义 ──

/** 思考阶段 */
export interface ThinkStep {
  type: 'think';
  id: number;
  content: string;
  done: boolean;
}

/** 工具调用阶段 */
export interface ToolStep {
  type: 'tool';
  id: number;
  name: string;
  command?: string;
  status: 'running' | 'done';
  success?: boolean;
  params?: Record<string, unknown>;
  error?: string;
  data?: unknown;
}

/** 文本阶段 */
export interface TextStep {
  type: 'text';
  id: number;
  content: string;
}

/** 所有阶段的联合类型 */
export type MessageStep = ThinkStep | ToolStep | TextStep;

// ── 向后兼容的旧类型（ChatPanel 渐进迁移用） ──

export interface ToolCall {
  callId: number;
  name: string;
  command?: string;
  status: 'running' | 'done';
  success?: boolean;
  params?: Record<string, unknown>;
  error?: string;
  data?: unknown;
}

/** 消息 */
export interface Message {
  id: string;
  dbId?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  // 新：结构化步骤（流式时构建）
  steps?: MessageStep[];
  // 旧字段保留，历史加载兜底 + 渐进迁移
  toolCalls?: ToolCall[];
  thinkingContent?: string;
  thinkingDone?: boolean;
}

// ── 工具函数 ──

/** 工具调用 JSON 标记（历史加载时检测合并） */
const TOOL_CALL_MARKERS = [
  '{"type": "tool_call',
  '{"type":"tool_call',
  '{"type": "tool_call_parallel',
  '{"type":"tool_call_parallel',
  '{"calls":',
  '{"calls" :',
  '{"tool":',
  '{"tool" :',
];

/** 判断消息是否应从历史显示中过滤 */
function isToolMessage(msg: HistoryMessage): boolean {
  if (msg.hidden) return true;
  const content = msg.content.trim();
  if (!content) return false;
  if (content.startsWith('<tool_result')) return true;
  if (content.startsWith('{"success"') || content.startsWith('{"error_code"')) return true;
  return false;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

let _nextStepId = 0;

// ── Steps 辅助操作（不可变更新） ──

/** push 新 step */
function pushStep(steps: MessageStep[], step: MessageStep): MessageStep[] {
  return [...steps, step];
}

/** 更新最后一个指定类型的 step */
function updateLastStep<T extends MessageStep>(
  steps: MessageStep[],
  type: T['type'],
  updater: (step: T) => T,
): MessageStep[] {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === type) {
      const updated = [...steps];
      updated[i] = updater(steps[i] as T);
      return updated;
    }
  }
  return steps;
}

/** 追加文本到最后一个 text step，没有则新建 */
function appendText(steps: MessageStep[], text: string): MessageStep[] {
  const last = steps[steps.length - 1];
  if (last && last.type === 'text') {
    return updateLastStep(steps, 'text', (s: TextStep) => ({
      ...s, content: s.content + text,
    }));
  }
  return pushStep(steps, { type: 'text', id: _nextStepId++, content: text });
}

/** 清空最后一个 text step */
function clearText(steps: MessageStep[]): MessageStep[] {
  const last = steps[steps.length - 1];
  if (last && last.type === 'text') {
    return updateLastStep(steps, 'text', (s: TextStep) => ({ ...s, content: '' }));
  }
  return steps;
}

/** 设置最后一个 text step 的内容 */
function setText(steps: MessageStep[], content: string): MessageStep[] {
  const last = steps[steps.length - 1];
  if (last && last.type === 'text') {
    return updateLastStep(steps, 'text', (s: TextStep) => ({ ...s, content }));
  }
  if (content) {
    return pushStep(steps, { type: 'text', id: _nextStepId++, content });
  }
  return steps;
}

// ── Hook ──

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [responseStyle, setResponseStyle] = useState<string>('balanced');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  /** 加载指定会话的历史消息 */
  const loadHistory = useCallback(async (sessionId: string, characterId?: string) => {
    try {
      const data = await getHistory(sessionId);
      const rawMessages: Message[] = data.messages
        .filter((msg: HistoryMessage) => !isToolMessage(msg))
        .map((msg: HistoryMessage) => ({
          id: `db_${msg.id}`,
          dbId: msg.id,
          role: msg.role,
          content: msg.content,
        }))
        .filter((msg: Message) => msg.content.trim().length > 0);

      // 合并 ReAct 循环产生的连续 assistant 消息
      const historyMessages: Message[] = [];
      for (const msg of rawMessages) {
        if (msg.role === 'assistant' && historyMessages.length > 0) {
          const prev = historyMessages[historyMessages.length - 1];
          if (prev.role === 'assistant' && TOOL_CALL_MARKERS.some(m => prev.content.includes(m))) {
            prev.content += '\n' + msg.content;
            continue;
          }
        }
        historyMessages.push(msg);
      }

      setMessages(historyMessages.length > 0 ? historyMessages : []);
      setCurrentSessionId(sessionId);
      if (characterId) {
        localStorage.setItem(`lastSession_${characterId}`, sessionId);
      }
      setError(null);
    } catch (err) {
      console.error('加载历史失败:', err);
      setError('加载历史失败');
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(null);
    setError(null);
  }, []);

  /** 发送消息（核心逻辑 — Steps 版） */
  const sendMessageToAPI = useCallback(async (
    messageContent: string,
    debugMode: boolean = false,
    onDebugEvent?: ((event: StreamEvent) => void) | null,
  ) => {
    if (!messageContent.trim()) return;

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
      steps: [],
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      await sendMessageStream(
        messageContent,
        // onText → 追加到最后一个 text step
        (text) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.id === assistantId) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + text,
                steps: appendText(last.steps || [], text),
              };
            }
            return updated;
          });
        },
        // onEvent → 构建 steps 数组
        (event: StreamEvent) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.id !== assistantId) return prev;

            let steps = last.steps || [];

            switch (event.type) {
              case 'think_start': {
                steps = pushStep(steps, {
                  type: 'think', id: _nextStepId++, content: '', done: false,
                });
                break;
              }
              case 'think_content': {
                steps = updateLastStep(steps, 'think', (s: ThinkStep) => ({
                  ...s, content: s.content + (event.content || ''),
                }));
                break;
              }
              case 'think_end': {
                steps = updateLastStep(steps, 'think', (s: ThinkStep) => ({
                  ...s, done: true,
                }));
                break;
              }
              case 'tool_start': {
                const raw = event.tool;
                const toolNames = (Array.isArray(raw) ? raw : [raw]).filter((n): n is string => typeof n === 'string');
                const toolCommands = Array.isArray(event.command) ? event.command : toolNames.map(() => typeof event.command === 'string' ? event.command : '');
                for (let i = 0; i < toolNames.length; i++) {
                  steps = pushStep(steps, {
                    type: 'tool',
                    id: _nextStepId++,
                    name: toolNames[i],
                    command: toolCommands[i] || '',
                    status: 'running' as const,
                    params: event.params,
                  });
                }
                break;
              }
              case 'tool_result': {
                // 找最后一个匹配的 running tool step
                for (let i = steps.length - 1; i >= 0; i--) {
                  const s = steps[i];
                  if (s.type === 'tool' && s.status === 'running' && s.name === event.tool
                    && (!event.command || s.command === event.command)) {
                    const updated2 = [...steps];
                    updated2[i] = {
                      ...s,
                      status: 'done',
                      success: event.success,
                      error: event.error,
                      data: event.data,
                    };
                    steps = updated2;
                    break;
                  }
                }
                break;
              }
              case 'text_clear': {
                steps = clearText(steps);
                break;
              }
              case 'text_set': {
                steps = setText(steps, event.content || '');
                break;
              }
              case 'status': {
                onDebugEvent?.(event);
                return prev;
              }
              case 'memory_debug':
              case 'react_trace':
              case 'rpg_state': {
                onDebugEvent?.(event);
                return prev;
              }
              case 'msg_saved': {
                const role = event.role;
                const dbId = event.db_id;
                if (!role || dbId === undefined) return prev;
                const idx = updated.map((m, i) => ({ m, i }))
                  .reverse()
                  .find(({ m }) => m.role === role && !m.dbId);
                if (idx) {
                  const newUpdated = [...updated];
                  newUpdated[idx.i] = { ...idx.m, dbId };
                  return newUpdated;
                }
                return prev;
              }
              case 'error': {
                steps = setText(steps, `❌ 服务错误：${event.message || '未知错误'}`);
                return [...updated.slice(0, -1), { ...last, steps, isStreaming: false }];
              }
              case 'done': {
                const updates: Partial<Message> = { isStreaming: false, steps };
                if (event.assistant_db_id) updates.dbId = event.assistant_db_id;
                return [...updated.slice(0, -1), { ...last, ...updates }];
              }
              default:
                return prev;
            }

            return [...updated.slice(0, -1), { ...last, steps }];
          });
        },
        sessionId,
        abortControllerRef.current.signal,
        debugMode,
        responseStyle,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.id === assistantId) {
            updated[updated.length - 1] = { ...last, isStreaming: false };
          }
          return updated;
        });
        setIsLoading(false);
        return;
      }
      console.error('Stream failed:', err);
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
      abortControllerRef.current = null;
    }
  }, [currentSessionId]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: generateMessageId(),
      role: 'system',
      content: text,
    }]);
  }, []);

  const abort = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (currentSessionId) {
      try { await cancelChat(currentSessionId); } catch { /* ignore */ }
    }
    setIsLoading(false);
  }, [currentSessionId]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.dbId || !currentSessionId) return;
    try {
      await editMessageAPI(currentSessionId, msg.dbId, newContent);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, content: newContent } : m
      ));
    } catch (err) {
      console.error('编辑消息失败:', err);
    }
  }, [messages, currentSessionId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!currentSessionId) { toast('未连接到会话，请刷新页面', 'error'); return; }
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (!msg.dbId) { console.warn('[useChat] 消息没有 dbId，仅从内存删除:', messageId); return; }
    try {
      await deleteMessageAPI(currentSessionId, msg.dbId);
    } catch (err) {
      console.error('删除消息失败:', err);
      if (err instanceof Error && err.message.includes('404')) return;
      toast('删除可能未生效，切换对话后会自动同步', 'error');
    }
  }, [messages, currentSessionId]);

  const regenerateMessage = useCallback(async (messageId: string, debugMode: boolean = false, onDebugEvent?: ((event: StreamEvent) => void) | null) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.dbId || !currentSessionId) return;
    try {
      const data = await regenerateMessageAPI(currentSessionId, msg.dbId);
      const idx = messages.findIndex(m => m.id === messageId);
      if (idx >= 0) { setMessages(prev => prev.slice(0, idx)); }
      await sendMessageToAPI(data.user_message, debugMode, onDebugEvent);
    } catch (err) {
      console.error('重新生成失败:', err);
      toast('重新生成失败', 'error');
    }
  }, [messages, currentSessionId, sendMessageToAPI]);

  const branchFromMessage = useCallback(async (messageId: string): Promise<string | null> => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.dbId || !currentSessionId) return null;
    try {
      const data = await branchSessionAPI(currentSessionId, msg.dbId);
      return data.new_session_id;
    } catch (err) {
      console.error('创建分支失败:', err);
      toast('创建分支失败', 'error');
      return null;
    }
  }, [messages, currentSessionId]);

  return {
    messages,
    isLoading,
    input,
    setInput,
    sendMessage: sendMessageToAPI,
    resetChat,
    loadHistory,
    clearMessages,
    addSystemMessage,
    currentSessionId,
    setCurrentSessionId,
    error,
    abort,
    editMessage,
    deleteMessage,
    regenerateMessage,
    branchFromMessage,
    responseStyle,
    setResponseStyle,
  };
}
