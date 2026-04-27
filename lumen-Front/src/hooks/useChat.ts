/**
 * 聊天状态管理Hook — 流式版 + 会话支持
 *
 * 职责：管理消息列表、流式接收状态、工具调用追踪、会话历史加载
 * 遵循单向依赖：hook → api/chat.ts + api/session.ts，不直接操作 DOM 或 SSE
 */
import { useState, useCallback, useRef } from 'react';
import { sendMessageStream, getHistory, cancelChat, editMessage as editMessageAPI, deleteMessage as deleteMessageAPI, regenerateMessage as regenerateMessageAPI, branchSession as branchSessionAPI, StreamEvent } from '../api/chat';
import { createSession } from '../api/session';
import { HistoryMessage } from '../types/session';
import { toast } from '../utils/toast';

/** 工具调用 JSON 标记（用于检测 ReAct 循环中的工具调用消息） */
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

/** 判断消息是否应从历史显示中过滤（仅过滤工具结果，不过滤工具调用） */
function isToolMessage(msg: HistoryMessage): boolean {
  const content = msg.content.trim();
  if (!content) return false;
  // 只过滤工具结果消息（user 角色保存的工具执行结果）
  if (content.startsWith('<tool_result')) return true;
  if (content.startsWith('{"success"') || content.startsWith('{"error_code"')) return true;
  return false;
}

/** 工具调用追踪 */
export interface ToolCall {
  callId: number;   // 唯一标识，用于匹配 tool_result
  name: string;
  command?: string;
  status: 'running' | 'done';
  success?: boolean;
  params?: Record<string, unknown>;
  error?: string;
  data?: unknown;
}

/** Memory 调试数据 */
export interface MemoryDebugLayer {
  name: string;
  tokens: number;
  content: string;
}
export interface RecalledMessage {
  role: string;
  content: string;
  session_id: string;
  created_at: string;
}
export interface RecallLogEntry {
  keyword: string;
  source: string;
  results: number;
  tokens: number;
  messages: RecalledMessage[];
}
export interface MemoryDebugData {
  layers: MemoryDebugLayer[];
  total_tokens: number;
  context_size: number;
  recall_log: RecallLogEntry[];
}

/** ReAct 追踪步骤 */
export interface ReactTraceStep {
  iteration: number;
  action: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'cancelled';
  tool?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  duration_ms?: number;
  thinking?: string;
  error?: string;
  exit_reason?: string;
}

/** 消息 */
export interface Message {
  id: string;
  dbId?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  thinkingContent?: string;   // 思维链内容
  thinkingDone?: boolean;     // 思维链是否完成
  isStreaming?: boolean;
}

/** 生成唯一消息 ID */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 工具调用自增 ID（解决同名并行工具匹配问题） */
let _nextCallId = 0;


export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [memoryDebugMode, setMemoryDebugMode] = useState(false);
  const [memoryDebugInfo, setMemoryDebugInfo] = useState<MemoryDebugData | null>(null);
  const [reactTrace, setReactTrace] = useState<ReactTraceStep[]>([]);
  const [responseStyle, setResponseStyle] = useState<string>('balanced');
  const abortControllerRef = useRef<AbortController | null>(null);

  /** 加载指定会话的历史消息 */
  const loadHistory = useCallback(async (sessionId: string, characterId?: string) => {
    try {
      const data = await getHistory(sessionId);
      const rawMessages: Message[] = data.messages
        .filter((msg: HistoryMessage) => !isToolMessage(msg))
        .map((msg: HistoryMessage) => ({
          // 使用数据库ID作为唯一标识，确保重新加载时ID保持不变
          id: `db_${msg.id}`,
          dbId: msg.id,
          role: msg.role,
          content: msg.content,
        }))
        .filter((msg: Message) => msg.content.trim().length > 0);

      // 合并 ReAct 循环产生的连续 assistant 消息（工具调用 + 最终回复 → 一条消息）
      const historyMessages: Message[] = [];
      for (const msg of rawMessages) {
        if (msg.role === 'assistant' && historyMessages.length > 0) {
          const prev = historyMessages[historyMessages.length - 1];
          // 前一条也是 assistant 且包含工具调用 JSON → 合并（与流式行为一致）
          if (prev.role === 'assistant' && TOOL_CALL_MARKERS.some(m => prev.content.includes(m))) {
            prev.content += '\n' + msg.content;
            continue;
          }
        }
        historyMessages.push(msg);
      }

      setMessages(historyMessages.length > 0 ? historyMessages : []);
      setCurrentSessionId(sessionId);

      // 记录该角色的最后会话（用于下次恢复）
      if (characterId) {
        localStorage.setItem(`lastSession_${characterId}`, sessionId);
      }

      setError(null);
    } catch (err) {
      console.error('加载历史失败:', err);
      setError('加载历史失败');
    }
  }, []);

  /** 清空前端消息（准备新会话），不调 API */
  const clearMessages = useCallback(() => {
    setMessages([]);
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
    setReactTrace([]);

    // 创建新的 AbortController（先 abort 旧的，防止竞态）
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

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
                const toolCommands = Array.isArray(event.command) ? event.command : toolNames.map(() => typeof event.command === 'string' ? event.command : '');
                console.log('[useChat] 工具开始执行:', toolNames, toolCommands);
                const newCalls: ToolCall[] = toolNames.map((name, idx) => ({
                  callId: _nextCallId++,
                  name,
                  command: toolCommands[idx] || '',
                  status: 'running' as const,
                  params: event.params,
                }));
                return [
                  ...updated.slice(0, -1),
                  { ...last, toolCalls: [...(last.toolCalls || []), ...newCalls] },
                ];
              }
              case 'tool_result': {
                console.log('[useChat] 工具执行结果:', event.tool, event.command, event.success ? '成功' : '失败');
                const calls = [...(last.toolCalls || [])];
                const idx = calls.findIndex(c =>
                  c.name === event.tool
                  && c.status === 'running'
                  && (!event.command || c.command === event.command)
                );
                if (idx !== -1) {
                  calls[idx] = { ...calls[idx], status: 'done', success: event.success, error: event.error, data: event.data };
                } else {
                  console.warn('[useChat] 未找到匹配的工具调用:', event.tool);
                }
                return [...updated.slice(0, -1), { ...last, toolCalls: calls }];
              }
              case 'text_clear': {
                return [...updated.slice(0, -1), { ...last, content: '' }];
              }
              case 'text_set': {
                return [...updated.slice(0, -1), { ...last, content: event.content || '' }];
              }
              case 'think_start': {
                return [...updated.slice(0, -1), { ...last, thinkingContent: '', thinkingDone: false }];
              }
              case 'think_content': {
                const thinking = (last.thinkingContent || '') + (event.content || '');
                return [...updated.slice(0, -1), { ...last, thinkingContent: thinking }];
              }
              case 'think_end': {
                return [...updated.slice(0, -1), { ...last, thinkingDone: true }];
              }
              case 'memory_debug': {
                setMemoryDebugInfo({
                  layers: event.layers || [],
                  total_tokens: event.total_tokens || 0,
                  context_size: event.context_size || 4096,
                  recall_log: event.recall_log || [],
                });
                return prev; // 不修改消息列表
              }
              case 'react_trace': {
                const toolVal = event.tool;
                const newStep: ReactTraceStep = {
                  iteration: event.iteration ?? 0,
                  action: event.action as ReactTraceStep['action'],
                  tool: Array.isArray(toolVal) ? toolVal.join(', ') : toolVal,
                  params: event.params,
                  success: event.success,
                  duration_ms: event.duration_ms,
                  thinking: event.thinking,
                  error: event.error,
                  exit_reason: event.exit_reason,
                };
                // 记录错误步骤
                if (event.action === 'error') {
                  console.error('[useChat] ReAct错误:', event.error);
                }
                setReactTrace(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.iteration === newStep.iteration && last.action === newStep.action && last.tool === newStep.tool && last.duration_ms === newStep.duration_ms) {
                    return prev;
                  }
                  return [...prev, newStep];
                });
                return prev;
              }
              case 'msg_saved': {
                // 后端推送消息的数据库 ID，用于编辑/删除
                const role = event.role;
                const dbId = event.db_id;
                if (!role || dbId === undefined) return prev;
                // 找到最近一条该角色且没有 dbId 的消息
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
              case 'done': {
                console.log('[useChat] 流式完成:', event.exit_reason);
                const updates: Partial<Message> = { isStreaming: false };
                if (event.assistant_db_id) updates.dbId = event.assistant_db_id;
                return [...updated.slice(0, -1), { ...last, ...updates }];
              }
              default:
                return prev;
            }
          });
        },
        // sessionId
        sessionId,
        abortControllerRef.current.signal,
        // memoryDebugMode
        memoryDebugMode,
        // responseStyle
        responseStyle,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用户主动中断，不视为错误
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
      abortControllerRef.current = null;
    }
  }, [currentSessionId, memoryDebugMode]);

  /** 重置聊天（前端清空） */
  const resetChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /** 切换 memory debug 模式 */
  const toggleMemoryDebug = useCallback(() => {
    setMemoryDebugMode(prev => !prev);
  }, []);

  /** 添加系统消息（命令结果等） */
  const addSystemMessage = useCallback((text: string) => {
    const msg: Message = {
      id: generateMessageId(),
      role: 'system',
      content: text,
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  /** 中断当前流式生成 */
  const abort = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (currentSessionId) {
      try {
        await cancelChat(currentSessionId);
      } catch {
        // 忽略取消 API 的错误
      }
    }
    setIsLoading(false);
  }, [currentSessionId]);

  /** 编辑消息 */
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

  /** 删除消息 */
  const deleteMessage = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.dbId || !currentSessionId) return;
    try {
      await deleteMessageAPI(currentSessionId, msg.dbId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error('删除消息失败:', err);
    }
  }, [messages, currentSessionId]);

  /** 重新生成 AI 回复 */
  const regenerateMessage = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.dbId || !currentSessionId) return;
    try {
      const data = await regenerateMessageAPI(currentSessionId, msg.dbId);
      // 从前端删除该消息及之后的所有消息
      const idx = messages.findIndex(m => m.id === messageId);
      if (idx >= 0) {
        setMessages(prev => prev.slice(0, idx));
      }
      // 用原来的用户消息重新触发流式
      await sendMessageToAPI(data.user_message);
    } catch (err) {
      console.error('重新生成失败:', err);
      toast('重新生成失败', 'error');
    }
  }, [messages, currentSessionId, sendMessageToAPI]);

  /** 创建分支会话 */
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
    memoryDebugMode,
    memoryDebugInfo,
    reactTrace,
    toggleMemoryDebug,
    editMessage,
    deleteMessage,
    regenerateMessage,
    branchFromMessage,
    responseStyle,
    setResponseStyle,
  };
}
