/**
 * 聊天界面布局容器
 *
 * 职责：组合 ActivityBar + SidePanel + ChatPanel + 浮动层，协调各 hook 数据流
 */
import { useEffect, useCallback, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useSessions } from '../hooks/useSessions';
import { useCharacters } from '../hooks/useCharacters';
import { usePersona } from '../hooks/usePersona';
import { useAuthorNote } from '../hooks/useAuthorNote';
import { CommandResult } from '../commands/registry';
import { getTokenUsage } from '../api/chat';
import { toast } from '../utils/toast';
import ActivityBar, { PanelId } from './ActivityBar';
import SidePanel from './SidePanel';
import ChatPanel from './ChatPanel';
import SystemPromptOverlay from './SystemPromptOverlay';
import FloatingLayerHost from './floating/FloatingLayerHost';
import MemoryWindow from './MemoryWindow';
import GraphWindow from './GraphWindow';
import { useFloatingLayers } from './floating/useFloatingLayers';
import { useDebugWindow } from '../hooks/useDebugWindow';
import { useDebugState } from '../hooks/useDebugState';
import { useRPG } from '../hooks/useRPG';
import RpgPanel from './RpgPanel';
import type { StreamEvent } from '../api/chat';

/** localStorage key — 与 DebugWindowPage 共用 */
const MEMORY_DEBUG_STORAGE_KEY = 'lumen_memory_debug';

function ChatInterface() {
  const chat = useChat();
  const debug = useDebugState();
  const sessions = useSessions();
  const characters = useCharacters();
  const persona = usePersona();
  const authorNote = useAuthorNote(sessions.currentSessionId);
  const floating = useFloatingLayers();
  const [memoryWindowOpen, setMemoryWindowOpen] = useState(false);
  const [graphWindowOpen, setGraphWindowOpen] = useState(false);
  const [sysPromptEditor, setSysPromptEditor] = useState<{
    content: string;
    onSave: (c: string) => void;
  } | null>(null);
  const rpg = useRPG();
  const [rpgPanelOpen, setRpgPanelOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState('');
  const [activePanelId, setActivePanelId] = useState<PanelId | null>('sessions');
  const [tokenUsage, setTokenUsage] = useState<{
    current_tokens: number; context_size: number; usage_percent: number
  } | null>(null);

  // 刷新 token 用量
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

  // 命令结果处理（显示为系统消息）
  const handleCommandResult = useCallback((result: CommandResult) => {
    chat.addSystemMessage(result.message);
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 消息发送后刷新 token 用量。回调中路由 rpg_state 事件到 RPG hook
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

  // Escape 键关闭浮动层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        floating.closeTopLayer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [floating]);

  // TitleBar 设置按钮事件
  useEffect(() => {
    const handler = () => floating.openSettings('config-list');
    window.addEventListener('lumen:open-settings', handler);
    return () => window.removeEventListener('lumen:open-settings', handler);
  }, [floating]);

  /** 新建会话 */
  const handleNewSession = async () => {
    const newId = await sessions.createNewSession(characters.currentCharacterId);
    chat.resetChat();
    chat.setCurrentSessionId(newId);
  };

  /** 切换会话 */
  const handleSwitchSession = async (sessionId: string) => {
    if (sessionId === sessions.currentSessionId) return;
    await sessions.switchSession(sessionId);
    await chat.loadHistory(sessionId);
    rpg.resetRpgState();
    setRpgPanelOpen(false);
    sessions.refreshSessions();
  };

  /** 删除会话 */
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

  /** 重命名会话 */
  const handleRenameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const { renameSession } = await import('../api/session');
      await renameSession(sessionId, title);
      sessions.refreshSessions();
    } catch { /* 静默失败 */ }
  }, [sessions]);

  /** 切换角色 */
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

  /** 切换 Persona */
  const handleSwitchPersona = useCallback(async (personaId: string | null) => {
    await persona.switchTo(personaId);
  }, [persona]);

  const handleToggleDebug = useCallback(() => {
    if (!debug.debugMode) {
      debug.toggleDebug();
    }
  }, [debug.debugMode, debug.toggleDebug]);

  // 调试窗口：Tauri 原生独立窗口
  useDebugWindow({
    debugInfo: debug.debugInfo,
    reactTrace: debug.reactTrace,
    isOpen: debug.debugMode,
    onClose: debug.toggleDebug,
  });

  // 全局菜单事件
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'lumen:open-knowledge': () => setMemoryWindowOpen(true),
      'lumen:open-graph': () => setGraphWindowOpen(true),
      'lumen:open-worldbook': () => floating.openSettings('worldbook-list'),
      'lumen:toggle-debug': handleToggleDebug,
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
  }, [floating, handleToggleDebug]);

  /** 面板切换 toggle 逻辑 */
  const handlePanelSelect = useCallback((id: PanelId) => {
    setActivePanelId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <ActivityBar
        activePanelId={activePanelId}
        onPanelSelect={handlePanelSelect}
        onOpenMemoryWindow={() => setMemoryWindowOpen(true)}
        onOpenGraphEditor={() => setGraphWindowOpen(true)}
        onManageWorldBooks={() => floating.openSettings('worldbook-list')}
        onToggleDebug={handleToggleDebug}
        onOpenSettings={() => floating.openSettings('config-list')}
      />
      <SidePanel
        activePanelId={activePanelId}
        sessions={sessions.sessions}
        currentSessionId={sessions.currentSessionId}
        isLoading={sessions.isLoading}
        onSelectSession={handleSwitchSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        formatLabel={sessions.formatSessionLabel}
        characters={characters.characters}
        currentCharacterId={characters.currentCharacterId}
        onSwitchCharacter={handleSwitchCharacter}
        onRefreshCharacters={() => characters.refreshCharacters()}
        onEditSystemPrompt={(content, onSave) => setSysPromptEditor({ content, onSave })}
        personas={persona.personas}
        activePersonaId={persona.activeId}
        onSwitchPersona={handleSwitchPersona}
        onRefreshPersonas={() => persona.refresh()}
      />
      <ChatPanel
        messages={chat.messages}
        isLoading={chat.isLoading}
        input={chat.input}
        error={chat.error}
        sessionId={sessions.currentSessionId}
        tokenUsage={tokenUsage}
        onInputChange={chat.setInput}
        onSendMessage={handleSendMessage}
        onCommandResult={handleCommandResult}
        onAbort={chat.abort}
        onCompact={async () => {
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
        }}
        onOpenMonitor={handleToggleDebug}
        characterName={characters.currentCharacter?.display_name || characters.currentCharacter?.name}
        characterAvatar={characters.currentCharacter?.avatar}
        currentModel={currentModel}
        onModelChange={setCurrentModel}
        onEditMessage={chat.editMessage}
        onDeleteMessage={chat.deleteMessage}
        onRegenerateMessage={async (messageId) => {
          rpg.resetRpgState();
          const onEvent = (event: StreamEvent) => {
            if (event.type === 'rpg_state') {
              rpg.handleEvent(event);
              setRpgPanelOpen(true);
            }
            debug.handleDebugEvent(event);
          };
          await chat.regenerateMessage(messageId, debug.debugMode, onEvent);
        }}
        onBranchFromMessage={async (messageId: string) => {
          const newId = await chat.branchFromMessage(messageId);
          if (newId) {
            await chat.loadHistory(newId, characters.currentCharacterId || undefined);
            chat.setCurrentSessionId(newId);
            sessions.switchSession(newId);
            sessions.refreshSessions();
          }
          return newId;
        }}
        responseStyle={chat.responseStyle}
        onResponseStyleChange={chat.setResponseStyle}
        authorNoteConfig={authorNote.config}
        onAuthorNoteSaveContent={authorNote.saveContent}
        onAuthorNoteSetPosition={authorNote.setPosition}
      />
      {sysPromptEditor && (
        <SystemPromptOverlay
          initialContent={sysPromptEditor.content}
          characterName={characters.currentCharacter?.display_name || characters.currentCharacter?.name}
          onSave={(c) => { sysPromptEditor.onSave(c); setSysPromptEditor(null); }}
          onClose={() => setSysPromptEditor(null)}
        />
      )}
      <FloatingLayerHost floating={floating} />
      <MemoryWindow
        open={memoryWindowOpen}
        onClose={() => setMemoryWindowOpen(false)}
      />
      <GraphWindow
        open={graphWindowOpen}
        onClose={() => setGraphWindowOpen(false)}
      />
      {rpgPanelOpen && rpg.roomState.roomId && (
        <RpgPanel
          roomState={rpg.roomState}
          playerId={characters.currentCharacterId}
          onClose={() => setRpgPanelOpen(false)}
        />
      )}
    </div>
  );
}

export default ChatInterface;
