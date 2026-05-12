/**
 * 聊天状态管理Hook — Steps 结构化版
 *
 * 核心变更：Assistant 消息从扁平字段 (content/toolCalls/thinkingContent)
 * 改为有序 steps 数组，每个 step 是一个独立视觉阶段（思考/工具/文本）。
 * 后端零改动，前端从现有 SSE 事件构建 steps。
 */
import { useState, useCallback, useRef } from 'react';
import { getHistory, editMessage as editMessageAPI, deleteMessage as deleteMessageAPI, regenerateMessage as regenerateMessageAPI, branchSession as branchSessionAPI, StreamEvent } from '../api/chat';
import { createSession } from '../api/session';
import { HistoryMessage } from '../types/session';
import { toast } from '../utils/toast';
import { useWebSocket } from './useWebSocket';
import { useSessionStore } from '../stores/useSessionStore';
import type { MessageStep } from '../types/chat';

// ── 类型从共享文件导入，re-export 保持兼容 ──
export type { Message, MessageStep, ThinkStep, ToolStep, TextStep, ToolCall, UseChatReturn } from '../types/chat';
import {
  type Message,
  type ThinkStep, type TextStep,
  pushStep,
  updateLastStep,
  clearText,
  setText,
  nextStepId,
} from '../types/chat';

// ReAct 循环中工具调用的标记，用于兼容旧历史的连续 assistant 合并
const TOOL_CALL_MARKERS = [
  '"tool":', '"type": "tool_call', '"calls":',
  '{"success":', '{"error_code":', '<tool_result', '<<<[TOOL_REQUEST]',
];

// ── 工具函数 ──

/** 判断消息是否应从历史显示中过滤 */
function isToolMessage(msg: HistoryMessage): boolean {
  if (msg.hidden || msg.metadata?.hidden || msg.metadata?.internal) return true;
  if (['tool_result', 'tool_result_parallel', 'system_feedback'].includes(msg.metadata?.type || '')) return true;
  const content = msg.content.trim();
  if (!content) return false;
  if (content.startsWith('<tool_result')) return true;
  if (content.startsWith('{"success"') || content.startsWith('{"error_code"')) return true;
  return false;
}

function buildHistorySteps(msg: HistoryMessage): MessageStep[] | undefined {
  if (msg.role !== 'assistant') return undefined;
  const steps: MessageStep[] = [];
  const reasoning = msg.metadata?.reasoning_content;
  if (reasoning) {
    steps.push({ type: 'think', id: nextStepId(), content: reasoning, done: true });
  }
  if (msg.content.trim()) {
    steps.push({ type: 'text', id: nextStepId(), content: msg.content });
  }
  return steps.length > 0 ? steps : undefined;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Steps 辅助操作已提取到 src/types/chat.ts（共享）

// ── Hook ──

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [responseStyle, setResponseStyle] = useState<string>('balanced');
  const [rpgMode, setRpgMode] = useState<boolean>(false);

  // 从 session store 读取 currentSessionId（单一数据源）
  const getSessionId = useCallback(() => useSessionStore.getState().currentSessionId, []);

  // 当前流式中的 assistant 消息 ID
  const streamingMsgIdRef = useRef<string | null>(null);
  // 外部 debug 回调
  const debugCallbackRef = useRef<((event: StreamEvent) => void) | null>(null);

  // T26: WebSocket 替代 SSE
  const { sendMessage: wsSend } = useWebSocket((event: StreamEvent) => {
    // 没有正在流的消息则忽略
    const msgId = streamingMsgIdRef.current;
    if (!msgId) return;

    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      const last = updated[lastIdx];
      if (!last || last.id !== msgId) return prev;

      let steps = last.steps || [];

      switch (event.type) {
        case 'think_start':
          steps = pushStep(steps, { type: 'think', id: nextStepId(), content: '', done: false });
          break;
        case 'think_content':
          steps = updateLastStep(steps, 'think', (s: ThinkStep) => ({ ...s, content: s.content + (event.content || '') }));
          break;
        case 'think_end':
          steps = updateLastStep(steps, 'think', (s: ThinkStep) => ({ ...s, done: true }));
          break;
        case 'tool_start': {
          const raw = event.tool;
          const toolNames = (Array.isArray(raw) ? raw : [raw]).filter((n): n is string => typeof n === 'string');
          const toolCommands = Array.isArray(event.command) ? event.command : toolNames.map(() => typeof event.command === 'string' ? event.command : '');
          for (let i = 0; i < toolNames.length; i++) {
            steps = pushStep(steps, { type: 'tool', id: nextStepId(), name: toolNames[i], command: toolCommands[i] || '', status: 'running' as const, params: event.params });
          }
          break;
        }
        case 'tool_result':
          for (let i = steps.length - 1; i >= 0; i--) {
            const s = steps[i];
            if (s.type === 'tool' && s.status === 'running' && s.name === event.tool && (!event.command || s.command === event.command)) {
              const u2 = [...steps];
              u2[i] = { ...s, status: 'done', success: event.success, error: event.error, data: event.data };
              steps = u2;
              break;
            }
          }
          break;
        case 'text_clear':
          steps = clearText(steps);
          break;
        case 'text': {
          // 增量文本：追加到最后一个 TextStep，没有则新建
          const lastStep = steps[steps.length - 1];
          if (lastStep && lastStep.type === 'text') {
            steps = updateLastStep(steps, 'text', (s: TextStep) => ({ ...s, content: s.content + (event.content || '') }));
          } else if (event.content) {
            steps = pushStep(steps, { type: 'text', id: nextStepId(), content: event.content });
          }
          break;
        }
        case 'text_set':
          steps = setText(steps, event.content || '');
          break;
        case 'status':
          debugCallbackRef.current?.(event);
          if (rpgMode && event.status === 'rpg_resolution' && event.message) {
            return [...updated, { id: crypto.randomUUID(), role: 'system' as const, content: event.message, timestamp: Date.now() }];
          }
          return prev;
        case 'memory_debug':
        case 'react_trace':
        case 'rpg_state':
          debugCallbackRef.current?.(event);
          return prev;
        case 'msg_saved':
          if (event.role && event.db_id !== undefined) {
            const idx = updated.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === event.role && !m.dbId);
            if (idx) {
              const nu = [...updated];
              nu[idx.i] = { ...idx.m, dbId: event.db_id };
              return nu;
            }
          }
          return prev;
        case 'error':
          steps = setText(steps, `Error: ${event.message || '未知错误'}`);
          setIsLoading(false);
          return [...updated.slice(0, -1), { ...last, steps, isStreaming: false }];
        case 'done': {
          // 安全机制：强制关闭所有未完成的思考步骤
          const safeSteps = steps.map(s =>
            s.type === 'think' && !s.done ? { ...s, done: true } : s
          );
          const updates: Partial<Message> = { isStreaming: false, steps: safeSteps };
          if (event.assistant_db_id) updates.dbId = event.assistant_db_id;
          streamingMsgIdRef.current = null;
          setIsLoading(false);
          // 更新会话标题（后端自动生成）
          if (event.title) {
            const sid = getSessionId();
            if (sid) {
              const { sessions } = useSessionStore.getState();
              const idx = sessions.findIndex(s => s.session_id === sid);
              if (idx >= 0 && !sessions[idx].title) {
                const updated = [...sessions];
                updated[idx] = { ...updated[idx], title: event.title as string };
                useSessionStore.setState({ sessions: updated });
              }
            }
          }
          return [...updated.slice(0, -1), { ...last, ...updates }];
        }
        default:
          return prev;
      }

      return [...updated.slice(0, -1), { ...last, steps }];
    });
  });

  /** 加载指定会话的历史消息 */
  const loadHistory = useCallback(async (sessionId: string, _characterId?: string) => {
    try {
      const data = await getHistory(sessionId);
      const rawMessages: Message[] = data.messages
        .filter((msg: HistoryMessage) => !isToolMessage(msg))
        .map((msg: HistoryMessage) => ({
          id: `db_${msg.id}`,
          dbId: msg.id,
          role: msg.role,
          content: msg.content,
          steps: buildHistorySteps(msg),
        }))
        .filter((msg: Message) => msg.content.trim().length > 0);

      const historyMessages: Message[] = [];
      for (const msg of rawMessages) {
        if (msg.role === 'assistant' && historyMessages.length > 0) {
          const prev = historyMessages[historyMessages.length - 1];
          if (prev.role === 'assistant' && TOOL_CALL_MARKERS.some(m => prev.content.includes(m))) {
            prev.content += '\n' + msg.content;
            if (msg.steps?.length) {
              prev.steps = [...(prev.steps || []), ...msg.steps];
            }
            continue;
          }
        }
        historyMessages.push(msg);
      }

      setMessages(historyMessages.length > 0 ? historyMessages : []);
      setError(null);
    } catch (err) {
      console.error('加载历史失败:', err);
      setError('加载历史失败');
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /** 发送消息（核心逻辑 — Steps 版） */
  const sendMessageToAPI = useCallback(async (
    messageContent: string,
    _debugMode: boolean = false,
    onDebugEvent?: ((event: StreamEvent) => void) | null,
    saveUserMessage: boolean = true,
  ) => {
    if (!messageContent.trim()) return;

    let sessionId = getSessionId();
    if (!sessionId) {
      try {
        const data = await createSession();
        sessionId = data.session_id;
        useSessionStore.getState().setCurrentSessionId(sessionId);
      } catch (err) {
        console.error('自动创建会话失败:', err);
        setError('创建会话失败');
        return;
      }
    }

    const assistantId = generateMessageId();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      steps: [],
      isStreaming: true,
    };

    if (saveUserMessage) {
      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: messageContent,
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
    } else {
      setMessages(prev => [...prev, assistantMessage]);
    }

    setInput('');
    setIsLoading(true);
    setError(null);

    streamingMsgIdRef.current = assistantId;
    debugCallbackRef.current = onDebugEvent || null;

    wsSend({
      type: 'chat',
      content: messageContent,
      session_id: sessionId,
      response_style: responseStyle,
      rpg_mode: rpgMode,
      memory_debug: _debugMode,
      save_user_message: saveUserMessage,
    });
  }, [getSessionId, responseStyle, rpgMode, wsSend]);

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

  const abort = useCallback(() => {
    wsSend({ type: 'cancel', session_id: getSessionId() || 'default' });
    streamingMsgIdRef.current = null;
    setIsLoading(false);
  }, [getSessionId, wsSend]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const msg = messages.find(m => m.id === messageId);
    const sessionId = getSessionId();
    if (!msg?.dbId || !sessionId) return;
    try {
      await editMessageAPI(sessionId, msg.dbId, newContent);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, content: newContent } : m
      ));
    } catch (err) {
      console.error('编辑消息失败:', err);
    }
  }, [messages, getSessionId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const sessionId = getSessionId();
    if (!sessionId) { toast('未连接到会话，请刷新页面', 'error'); return; }
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (!msg.dbId) { console.warn('[useChat] 消息没有 dbId，仅从内存删除:', messageId); return; }
    try {
      await deleteMessageAPI(sessionId, msg.dbId);
    } catch (err) {
      console.error('删除消息失败:', err);
      if (err instanceof Error && err.message.includes('404')) return;
      toast('删除可能未生效，切换对话后会自动同步', 'error');
    }
  }, [messages, getSessionId]);

  const regenerateMessage = useCallback(async (messageId: string, debugMode: boolean = false, onDebugEvent?: ((event: StreamEvent) => void) | null) => {
    const msg = messages.find(m => m.id === messageId);
    const sessionId = getSessionId();
    if (!msg?.dbId || !sessionId) return;
    try {
      const data = await regenerateMessageAPI(sessionId, msg.dbId);
      const idx = messages.findIndex(m => m.id === messageId);
      if (idx >= 0) { setMessages(prev => prev.slice(0, idx)); }
      await sendMessageToAPI(data.user_message, debugMode, onDebugEvent, false);
    } catch (err) {
      console.error('重新生成失败:', err);
      toast('重新生成失败', 'error');
    }
  }, [messages, getSessionId, sendMessageToAPI]);

  const branchFromMessage = useCallback(async (messageId: string): Promise<string | null> => {
    const msg = messages.find(m => m.id === messageId);
    const sessionId = getSessionId();
    if (!msg?.dbId || !sessionId) return null;
    try {
      const data = await branchSessionAPI(sessionId, msg.dbId);
      return data.new_session_id;
    } catch (err) {
      console.error('创建分支失败:', err);
      toast('创建分支失败', 'error');
      return null;
    }
  }, [messages, getSessionId]);

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
    error,
    abort,
    editMessage,
    deleteMessage,
    regenerateMessage,
    branchFromMessage,
    responseStyle,
    setResponseStyle,
    rpgMode,
    setRpgMode,
  };
}
