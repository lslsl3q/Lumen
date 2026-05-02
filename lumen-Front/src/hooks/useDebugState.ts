/**
 * useDebugState — 调试监控状态管理
 *
 * 拥有：debugMode（窗口开关）、debugInfo（token 层数据）、reactTrace（ReAct 追踪）
 * 不依赖 useChat，由 ChatInterface 通过 onDebugEvent 回调桥接 SSE 事件
 */
import { useState, useCallback } from 'react';
import type { MemoryDebugLayer } from '../types/debug';
import type { StreamEvent } from '../api/chat';

export interface MemoryDebugData {
  layers: MemoryDebugLayer[];
  total_tokens: number;
  context_size: number;
  recall_log: RecallLogEntry[];
}

export interface RecallLogEntry {
  keyword: string;
  source: string;
  results: number;
  tokens: number;
  method?: string;         // "sparse" | "bm25" | "fulltext"
  vector_count?: number;
  sparse_count?: number;
  graph_count?: number;
  messages?: RecalledMessage[];
}

export interface RecalledMessage {
  role: string;
  content: string;
  session_id: string;
  created_at?: string;
}

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

export function useDebugState() {
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<MemoryDebugData | null>(null);
  const [reactTrace, setReactTrace] = useState<ReactTraceStep[]>([]);

  const toggleDebug = useCallback(() => {
    setDebugMode(prev => !prev);
  }, []);

  /** 处理 SSE 调试事件（由 useChat 调用） */
  const handleDebugEvent = useCallback((event: StreamEvent) => {
    if (event.type === 'memory_debug') {
      setDebugInfo({
        layers: event.layers || [],
        total_tokens: event.total_tokens || 0,
        context_size: event.context_size || 4096,
        recall_log: event.recall_log || [],
      });
    } else if (event.type === 'react_trace') {
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
      if (event.action === 'error') {
        console.error('[useDebugState] ReAct错误:', event.error);
      }
      setReactTrace(prev => {
        const last = prev[prev.length - 1];
        if (last && last.iteration === newStep.iteration && last.action === newStep.action && last.tool === newStep.tool && last.duration_ms === newStep.duration_ms) {
          return prev;
        }
        return [...prev, newStep];
      });
    }
  }, []);

  /** 新消息发送前清空 ReAct 追踪 */
  const clearTrace = useCallback(() => {
    setReactTrace([]);
  }, []);

  return {
    debugMode,
    debugInfo,
    reactTrace,
    toggleDebug,
    handleDebugEvent,
    clearTrace,
  };
}
