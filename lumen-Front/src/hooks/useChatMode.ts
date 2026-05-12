// src/hooks/useChatMode.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { useChat } from './useChat';
import { useCharacterStore } from '../stores/useCharacterStore';
import { usePersonaStore } from '../stores/usePersonaStore';
import { useSessionStore } from '../stores/useSessionStore';
import { useAuthorNote } from './useAuthorNote';
import { useRPG } from './useRPG';
import { getTokenUsage } from '../api/chat';
import type { StreamEvent } from '../api/chat';
import { toast } from '../utils/toast';
import type { CommandResult } from '../commands/registry';
import type { useDebugState } from './useDebugState';

const MEMORY_DEBUG_STORAGE_KEY = 'lumen_memory_debug';

interface UseChatModeParams {
  debug: ReturnType<typeof useDebugState>;
  floating: {
    openSettings: (section?: string) => void;
  };
}

export function useChatMode({ debug, floating }: UseChatModeParams) {
  const chat = useChat();
  const characters = useCharacterStore();
  const persona = usePersonaStore();
  const sessions = useSessionStore();
  const authorNote = useAuthorNote(sessions.currentSessionId);
  const rpg = useRPG();

  // ── 会话同步 refs ──
  const prevSessionIdRef = useRef<string | null>(null);
  const prevCharIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const [memoryWindowOpen, setMemoryWindowOpen] = useState(false);
  const [graphWindowOpen, setGraphWindowOpen] = useState(false);
  const [rpgPanelOpen, setRpgPanelOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState('');
  const [tokenUsage, setTokenUsage] = useState<{
    current_tokens: number; context_size: number; usage_percent: number
  } | null>(null);

  // Token 用量刷新
  const refreshTokenUsage = useCallback(async () => {
    if (!sessions.currentSessionId) return;
    try {
      const data = await getTokenUsage(sessions.currentSessionId);
      setTokenUsage({
        current_tokens: data.current_tokens,
        context_size: data.context_size,
        usage_percent: data.usage_percent,
      });
    } catch { /* 忽略 */ }
  }, [sessions.currentSessionId]);

  // 命令结果处理
  const handleCommandResult = useCallback((result: CommandResult) => {
    chat.addSystemMessage(result.message);
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 发送消息（含 RPG + Debug 事件路由）
  const handleSendMessage = useCallback(async (msg: string) => {
    debug.clearTrace();
    rpg.resetRpgState();
    const onEvent = (event: StreamEvent) => {
      if (event.type === 'rpg_state') {
        rpg.handleEvent(event);
        setRpgPanelOpen(true);
      }
      if (event.type === 'status' && event.message) {
        toast(event.message, 'info');
      }
      debug.handleDebugEvent(event);
    };
    await chat.sendMessage(msg, debug.debugMode, onEvent);
    refreshTokenUsage();
  }, [chat, debug, rpg, refreshTokenUsage]);

  // Session sync effect：currentSessionId 变化时自动加载历史
  // 依赖数组故意只有 [currentSessionId, isLoading]：
  //   - chat.loadHistory / chat.resetChat 是 useCallback 稳定引用
  //   - chat.isLoading / chat.messages 只在 effect 内读取，不需要触发重跑
  //   - characters.currentCharacterId 通过 ref 读取（prevCharIdRef）
  useEffect(() => {
    const sessionId = sessions.currentSessionId;
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevCharIdRef.current = characters.currentCharacterId;
      if (sessionId) chat.loadHistory(sessionId, characters.currentCharacterId);
      return;
    }

    if (sessions.isLoading) return;
    if (sessionId === prevId) return;

    // 竞态防护：精准识别"首条消息自动创建会话"场景
    const isAutoCreatedFirstMessage = !prevId && sessionId && chat.messages.length > 0;
    if (isAutoCreatedFirstMessage) return;

    if (sessionId) {
      if (chat.isLoading) chat.abort();
      chat.loadHistory(sessionId, characters.currentCharacterId);
      rpg.resetRpgState();
      setRpgPanelOpen(false);
    } else {
      chat.resetChat();
    }
  }, [sessions.currentSessionId, sessions.isLoading]);

  // Character change effect：角色切换时原子更新会话
  useEffect(() => {
    if (!initializedRef.current) return;
    if (characters.currentCharacterId === prevCharIdRef.current) return;
    prevCharIdRef.current = characters.currentCharacterId;
    sessions.handleCharacterSwitch(characters.currentCharacterId);
  }, [characters.currentCharacterId]);

  // 会话变化时获取 token 用量
  useEffect(() => {
    if (sessions.currentSessionId) {
      refreshTokenUsage();
    } else {
      setTokenUsage(null);
    }
  }, [sessions.currentSessionId, refreshTokenUsage]);

  // debugInfo 保存到 localStorage
  useEffect(() => {
    if (debug.debugInfo) {
      try {
        localStorage.setItem(MEMORY_DEBUG_STORAGE_KEY, JSON.stringify({
          layers: debug.debugInfo.layers,
          totalTokens: debug.debugInfo.total_tokens,
          contextSize: debug.debugInfo.context_size,
          recallLog: debug.debugInfo.recall_log,
          timestamp: Date.now(),
        }));
      } catch { /* localStorage 写入失败忽略 */ }
    }
  }, [debug.debugInfo]);

  // 全局菜单事件
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'lumen:open-knowledge': () => setMemoryWindowOpen(true),
      'lumen:open-graph': () => setGraphWindowOpen(true),
      'lumen:open-worldbook': () => floating.openSettings('worldbook-list'),
      'lumen:toggle-debug': () => {
        if (!debug.debugMode) {
          debug.toggleDebug();
        }
      },
      'lumen:open-pin-config': () => floating.openSettings('config-list'),
    };
    Object.entries(handlers).forEach(([event, handler]) => {
      window.addEventListener(event, handler as EventListener);
    });
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        window.removeEventListener(event, handler as EventListener);
      });
    };
  }, [floating, debug]);

  // TitleBar 设置按钮事件
  useEffect(() => {
    const handler = () => floating.openSettings('config-list');
    window.addEventListener('lumen:open-settings', handler);
    return () => window.removeEventListener('lumen:open-settings', handler);
  }, [floating]);

  // 重命名会话
  const handleRenameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const { renameSession } = await import('../api/session');
      await renameSession(sessionId, title);
      sessions.refreshSessions();
    } catch { /* 静默失败 */ }
  }, [sessions]);

  // 切换 Persona
  const handleSwitchPersona = useCallback(async (personaId: string | null) => {
    await persona.switchTo(personaId);
  }, [persona]);

  // Compact
  const handleCompact = async () => {
    if (!sessions.currentSessionId) return;
    try {
      const { compactSession } = await import('../api/chat');
      const result = await compactSession(sessions.currentSessionId);
      if (result.compacted) {
        chat.addSystemMessage(`上下文已压缩: ${result.tokens_before} → ${result.tokens_after} tokens`);
      } else {
        chat.addSystemMessage('上下文已经很简洁，无需压缩');
      }
      refreshTokenUsage();
    } catch (err) {
      chat.addSystemMessage('压缩失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // Regenerate
  const handleRegenerate = useCallback(async (messageId: string) => {
    debug.clearTrace();
    rpg.resetRpgState();
    const onEvent = (event: StreamEvent) => {
      if (event.type === 'rpg_state') {
        rpg.handleEvent(event);
        setRpgPanelOpen(true);
      }
      debug.handleDebugEvent(event);
    };
    await chat.regenerateMessage(messageId, debug.debugMode, onEvent);
  }, [chat, debug, rpg]);

  // Branch
  const handleBranch = async (messageId: string) => {
    const newId = await chat.branchFromMessage(messageId);
    if (newId) {
      sessions.switchSession(newId);
      sessions.refreshSessions();
    }
    return newId;
  };

  // Debug toggle（仅打开）
  const handleToggleDebug = useCallback(() => {
    if (!debug.debugMode) {
      debug.toggleDebug();
    }
  }, [debug.debugMode, debug.toggleDebug]);

  return {
    chat, sessions, characters, persona, authorNote, rpg,
    tokenUsage, currentModel,
    memoryWindowOpen, graphWindowOpen, rpgPanelOpen,
    setMemoryWindowOpen, setGraphWindowOpen, setRpgPanelOpen, setCurrentModel,
    handleSendMessage, handleRenameSession, handleSwitchPersona, handleCommandResult,
    handleToggleDebug, handleCompact, handleRegenerate, handleBranch,
    refreshTokenUsage,
  };
}
