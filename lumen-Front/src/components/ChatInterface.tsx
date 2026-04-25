/**
 * 聊天界面布局容器
 *
 * 职责：组合 NavRail + ChatPanel + RightRail + 浮动层，协调各 hook 数据流
 * 浮动层系统：ContextPanel / SettingsOverlay / FloatingWindow
 */
import { useEffect, useCallback, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useSessions } from '../hooks/useSessions';
import { useCharacters } from '../hooks/useCharacters';
import { usePersona } from '../hooks/usePersona';
import { useAuthorNote } from '../hooks/useAuthorNote';
import { CommandResult } from '../commands/registry';
import { getTokenUsage } from '../api/chat';
import NavRail from './NavRail';
import ChatPanel from './ChatPanel';
import RightRail from './RightRail';
import DebugDrawer from './DebugDrawer';
import ContextPanel from './floating/ContextPanel';
import FloatingLayerHost from './floating/FloatingLayerHost';
import MemoryWindow from './MemoryWindow';
import { useFloatingLayers } from './floating/useFloatingLayers';
import { MEMORY_DEBUG_STORAGE_KEY } from '../pages/TokenInspector';

function ChatInterface() {
  const chat = useChat();
  const sessions = useSessions();
  const characters = useCharacters();
  const persona = usePersona();
  const authorNote = useAuthorNote(sessions.currentSessionId);
  const floating = useFloatingLayers();
  const [memoryWindowOpen, setMemoryWindowOpen] = useState(false);
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
    if (result.success && result.message === 'toggle_memory_debug') {
      chat.toggleMemoryDebug();
      return;
    }
    chat.addSystemMessage(result.message);
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 消息发送后刷新 token 用量
  const handleSendMessage = useCallback(async (msg: string) => {
    await chat.sendMessage(msg);
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

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

  // memoryDebugInfo 保存到 localStorage
  useEffect(() => {
    if (chat.memoryDebugInfo) {
      try {
        localStorage.setItem(MEMORY_DEBUG_STORAGE_KEY, JSON.stringify({
          layers: chat.memoryDebugInfo.layers,
          totalTokens: chat.memoryDebugInfo.total_tokens,
          contextSize: chat.memoryDebugInfo.context_size,
          recallLog: chat.memoryDebugInfo.recall_log,
          timestamp: Date.now(),
        }));
      } catch { /* localStorage 写入失败忽略 */ }
    }
  }, [chat.memoryDebugInfo]);

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
    const handler = () => floating.openSettings('character-list');
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
  }, [sessions, characters, chat]);

  /** 切换 Persona */
  const handleSwitchPersona = useCallback(async (personaId: string | null) => {
    await persona.switchTo(personaId);
  }, [persona]);

  // ContextPanel 和 DebugDrawer 互斥
  const handleOpenContextPanel = useCallback((kind: Parameters<typeof floating.openContextPanel>[0]) => {
    if (chat.memoryDebugMode) chat.toggleMemoryDebug();
    floating.openContextPanel(kind);
  }, [chat, floating]);

  const handleToggleDebug = useCallback(() => {
    if (floating.state.contextPanel.open) floating.closeContextPanel();
    chat.toggleMemoryDebug();
  }, [chat, floating]);

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <NavRail
        sessions={sessions.sessions}
        currentSessionId={sessions.currentSessionId}
        isLoading={sessions.isLoading}
        onSelectSession={handleSwitchSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        formatLabel={sessions.formatSessionLabel}
        characters={characters.characters}
        currentCharacterId={characters.currentCharacterId}
        activePersonaName={persona.activeName}
        authorNoteConfig={authorNote.config}
        onOpenContextPanel={handleOpenContextPanel}
        onRenameSession={handleRenameSession}
        onOpenSettings={() => {}}
        onOpenMemoryWindow={() => setMemoryWindowOpen(true)}
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
        onOpenConfig={() => floating.openSettings('config-list')}
        characterName={characters.currentCharacter?.display_name || characters.currentCharacter?.name}
        characterAvatar={characters.currentCharacter?.avatar}
        currentModel=""
        onEditMessage={chat.editMessage}
        onDeleteMessage={chat.deleteMessage}
        responseStyle={chat.responseStyle}
        onResponseStyleChange={chat.setResponseStyle}
      />
      <RightRail
        onToggleDebug={handleToggleDebug}
        isDebugOpen={chat.memoryDebugMode}
        onManageWorldBooks={() => handleOpenContextPanel('worldbook')}
      />
      <DebugDrawer
        open={chat.memoryDebugMode}
        onClose={() => chat.toggleMemoryDebug()}
        layers={chat.memoryDebugInfo?.layers || []}
        totalTokens={chat.memoryDebugInfo?.total_tokens || 0}
        contextSize={chat.memoryDebugInfo?.context_size || 0}
        recallLog={chat.memoryDebugInfo?.recall_log || null}
        reactTrace={chat.reactTrace}
      />
      <ContextPanel
        open={floating.state.contextPanel.open}
        kind={floating.state.contextPanel.kind}
        onClose={floating.closeContextPanel}
        characters={characters.characters}
        currentCharacterId={characters.currentCharacterId}
        onSwitchCharacter={handleSwitchCharacter}
        onManageCharacters={() => { floating.closeContextPanel(); floating.openSettings('character-list'); }}
        personas={persona.personas}
        activePersonaId={persona.activeId}
        activePersonaName={persona.activeName}
        onSwitchPersona={handleSwitchPersona}
        onManagePersonas={() => { floating.closeContextPanel(); floating.openSettings('persona-list'); }}
        onManageWorldBooks={() => { floating.closeContextPanel(); floating.openSettings('worldbook-list'); }}
        authorNoteConfig={authorNote.config}
        authorNoteLoading={authorNote.isLoading}
        onAuthorNoteSaveContent={authorNote.saveContent}
        onAuthorNoteSetPosition={authorNote.setPosition}
      />
      <FloatingLayerHost floating={floating} />
      <MemoryWindow
        open={memoryWindowOpen}
        onClose={() => setMemoryWindowOpen(false)}
      />
    </div>
  );
}

export default ChatInterface;
