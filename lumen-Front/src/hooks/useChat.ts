/**
 * 聊天状态管理Hook — 流式版 + 会话支持
 *
 * 职责：管理消息列表、流式接收状态、工具调用追踪、会话历史加载
 * 遵循单向依赖：hook → api/chat.ts + api/session.ts，不直接操作 DOM 或 SSE
 */
import { useState, useCallback, useRef } from 'react';
import { sendMessageStream, getHistory, cancelChat, StreamEvent } from '../api/chat';
import { createSession } from '../api/session';
import { HistoryMessage } from '../types/session';

/** 判断消息是否应从历史显示中过滤（纯工具调用/结果） */
function isToolMessage(msg: HistoryMessage): boolean {
  const content = msg.content.trim();
  if (!content) return false;
  // AI 可能在 JSON 前加文字（如"让我读取文件..."），用 includes 而非 startsWith
  if (content.includes('"type": "tool_call') || content.includes('"type":"tool_call')) return true;
  if (content.includes('"type": "tool_call_parallel') || content.includes('"type":"tool_call_parallel')) return true;
  if (content.includes('<tool_result')) return true;
  if (content.startsWith('{"success"') || content.startsWith('{"error_code"')) return true;
  return false;
}

/** 从消息内容中提取工具调用信息（加载历史时用） */
function extractToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  // 旧格式：{"type": "tool_call", "tool": "xxx", ...}
  const singleRegex = /"type"\s*:\s*"tool_call"\s*,.*?"tool"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = singleRegex.exec(content)) !== null) {
    calls.push({ callId: _nextCallId++, name: m[1], status: 'done' });
  }
  // 旧格式并行：{"type": "tool_call_parallel", "calls": [{"tool": "xxx", ...}, ...]}
  const parallelRegex = /"type"\s*:\s*"tool_call_parallel"\s*,.*?"calls"\s*:\s*\[([\s\S]*?)\]/g;
  while ((m = parallelRegex.exec(content)) !== null) {
    const inner = /"tool"\s*:\s*"([^"]+)"/g;
    let im;
    while ((im = inner.exec(m[1])) !== null) {
      calls.push({ callId: _nextCallId++, name: im[1], status: 'done' });
    }
  }
  // T10 新格式：{"calls": [{"tool": "xxx", "params": {...}}, ...]}
  // 用花括号深度计数找 JSON 边界，然后解析拿到完整 params
  const callsIdx = content.indexOf('{"calls"');
  if (callsIdx !== -1) {
    const sub = content.substring(callsIdx);
    let depth = 0, inStr = false, esc = false, jsonEnd = -1;
    for (let i = 0; i < sub.length; i++) {
      const ch = sub[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
    }
    if (jsonEnd !== -1) {
      try {
        const parsed = JSON.parse(sub.substring(0, jsonEnd));
        if (Array.isArray(parsed.calls)) {
          for (const c of parsed.calls) {
            if (c.tool) {
              calls.push({
                callId: _nextCallId++,
                name: c.tool,
                status: 'done',
                params: c.params || {},
              });
            }
          }
        }
      } catch { /* JSON 解析失败忽略 */ }
    }
  }
  return calls;
}

/** 剥离消息内容中嵌入的工具调用 JSON，保留前后的文字部分 */
function stripToolJson(content: string): string {
  let cleaned = content;
  // 反复剥离 tool_call 和 tool_result JSON 块
  for (const marker of ['{"type": "tool_call', '{"type":"tool_call', '{"type": "tool_call_parallel', '{"type":"tool_call_parallel', '{"calls":', '{"calls" :', '{"success":', '{"error_code":']) {
    while (true) {
      const idx = cleaned.indexOf(marker);
      if (idx === -1) break;
      // 找到匹配的闭合花括号
      let depth = 0;
      let inStr = false;
      let esc = false;
      let end = -1;
      for (let i = idx; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end === -1) break;
      cleaned = cleaned.slice(0, idx) + cleaned.slice(end);
    }
  }
  // 剥离 XML 格式的工具结果
  cleaned = cleaned.replace(/<tool_result[\s\S]*?<\/tool_result>/g, '');
  return cleaned.trim();
}

/** 工具调用追踪 */
export interface ToolCall {
  callId: number;   // 唯一标识，用于匹配 tool_result
  name: string;
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
  const abortControllerRef = useRef<AbortController | null>(null);

  /** 加载指定会话的历史消息 */
  const loadHistory = useCallback(async (sessionId: string, characterId?: string) => {
    try {
      const data = await getHistory(sessionId);
      const historyMessages: Message[] = data.messages
        .filter((msg: HistoryMessage) => !isToolMessage(msg))
        .map((msg: HistoryMessage, i: number) => {
          const toolCalls = extractToolCalls(msg.content);
          return {
            id: `hist_${sessionId}_${i}`,
            role: msg.role,
            content: stripToolJson(msg.content),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
          };
        })
        .filter((msg: Message) => msg.content.length > 0 || (msg.toolCalls && msg.toolCalls.length > 0));
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
                const newCalls: ToolCall[] = toolNames.map(name => ({
                  callId: _nextCallId++,
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
                  calls[idx] = { ...calls[idx], status: 'done', success: event.success, error: event.error, data: event.data };
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
                setReactTrace(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.iteration === newStep.iteration && last.action === newStep.action && last.tool === newStep.tool && last.duration_ms === newStep.duration_ms) {
                    return prev;
                  }
                  return [...prev, newStep];
                });
                return prev;
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
        sessionId,
        abortControllerRef.current.signal,
        // memoryDebugMode
        memoryDebugMode,
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
  };
}
