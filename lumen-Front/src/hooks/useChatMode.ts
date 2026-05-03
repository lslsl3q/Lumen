// src/hooks/useChatMode.ts
import { useState, useCallback, useEffect } from 'react';
import { useChat } from './useChat';
import { useSessions } from './useSessions';
import { useCharacters } from './useCharacters';
import { usePersona } from './usePersona';
import { useAuthorNote } from './useAuthorNote';
import { useRPG } from './useRPG';
import { getTokenUsage } from '../api/chat';
import type { StreamEvent } from '../api/chat';
import { toast } from '../utils/toast';
import type { CommandResult } from '../commands/registry';
import type { PanelId } from '../components/ActivityBar';
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
  const sessions = useSessions();
  const characters = useCharacters();
  const persona = usePersona();
  const authorNote = useAuthorNote(sessions.currentSessionId);
  const rpg = useRPG();

  const [memoryWindowOpen, setMemoryWindowOpen] = useState(false);
  const [graphWindowOpen, setGraphWindowOpen] = useState(false);
  const [sysPromptEditor, setSysPromptEditor] = useState<{
    content: string;
    onSave: (c: string) => void;
  } | null>(null);
  const [rpgPanelOpen, setRpgPanelOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState('');
  const [activePanelId, setActivePanelId] = useState<PanelId | null>('sessions');
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

  // 初始化同步
  useEffect(() => {
    if (!sessions.isLoading && sessions.currentSessionId && !chat.currentSessionId) {
      const lastCharId = localStorage.getItem('lastCharacterId') || undefined;
      chat.loadHistory(sessions.currentSessionId, lastCharId);
    }
  }, [sessions.isLoading, sessions.currentSessionId, chat.currentSessionId, chat.loadHistory]);

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

  // 新建会话
  const handleNewSession = async () => {
    const newId = await sessions.createNewSession(characters.currentCharacterId);
    chat.resetChat();
    chat.setCurrentSessionId(newId);
  };

  // 切换会话
  const handleSwitchSession = async (sessionId: string) => {
    if (sessionId === sessions.currentSessionId) return;
    await sessions.switchSession(sessionId);
    await chat.loadHistory(sessionId);
    rpg.resetRpgState();
    setRpgPanelOpen(false);
    sessions.refreshSessions();
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    const newSessionId = await sessions.deleteSession(sessionId);
    if (newSessionId) {
      const charId = characters.currentCharacterId;
      await chat.loadHistory(newSessionId, charId);
    } else {
      chat.resetChat();
      chat.setCurrentSessionId(null);
    }
  };

  // 重命名会话
  const handleRenameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const { renameSession } = await import('../api/session');
      await renameSession(sessionId, title);
      sessions.refreshSessions();
    } catch { /* 静默失败 */ }
  }, [sessions]);

  // 切换角色
  const handleSwitchCharacter = useCallback(async (characterId: string) => {
    characters.setCurrentCharacterId(characterId);
    const list = await sessions.setCharacterFilter(characterId);
    rpg.resetRpgState();
    setRpgPanelOpen(false);
    if (list.length > 0) {
      const lastSessionId = localStorage.getItem(`lastSession_${characterId}`);
      const targetId = (lastSessionId && list.some(s => s.session_id === lastSessionId))
        ? lastSessionId
        : list[0].session_id;
      sessions.setCurrentSessionId(targetId);
      await chat.loadHistory(targetId, characterId);
    } else {
      sessions.setCurrentSessionId(null);
      chat.resetChat();
      chat.setCurrentSessionId(null);
    }
  }, [sessions, characters, chat, rpg]);

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
      await chat.loadHistory(newId, characters.currentCharacterId || undefined);
      chat.setCurrentSessionId(newId);
      sessions.switchSession(newId);
      sessions.refreshSessions();
    }
    return newId;
  };

  // 面板切换
  const handlePanelSelect = useCallback((id: PanelId) => {
    setActivePanelId(prev => prev === id ? null : id);
  }, []);

  // Debug toggle（仅打开）
  const handleToggleDebug = useCallback(() => {
    if (!debug.debugMode) {
      debug.toggleDebug();
    }
  }, [debug.debugMode, debug.toggleDebug]);

  return {
    chat, sessions, characters, persona, authorNote, rpg,
    activePanelId, tokenUsage, currentModel,
    memoryWindowOpen, graphWindowOpen, sysPromptEditor, rpgPanelOpen,
    setMemoryWindowOpen, setGraphWindowOpen, setSysPromptEditor, setRpgPanelOpen, setCurrentModel,
    handleSendMessage, handleNewSession, handleSwitchSession, handleDeleteSession,
    handleRenameSession, handleSwitchCharacter, handleSwitchPersona, handleCommandResult,
    handlePanelSelect, handleToggleDebug, handleCompact, handleRegenerate, handleBranch,
    refreshTokenUsage,
  };
}
