/**
 * 聊天界面布局容器
 *
 * 职责：组合 Sidebar + ChatPanel，协调 useSessions、useChat、useCharacters 三个 hook 的数据流
 * 这是整个聊天页面的顶层组件
 */
import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useSessions } from '../hooks/useSessions';
import { useCharacters } from '../hooks/useCharacters';
import { usePersona } from '../hooks/usePersona';
import { useAuthorNote } from '../hooks/useAuthorNote';
import { CommandResult } from '../commands/registry';
import { getTokenUsage } from '../api/chat';
import ChatSidebar from './ChatSidebar';
import ChatPanel from './ChatPanel';
import DebugDrawer from './DebugDrawer';
import { MEMORY_DEBUG_STORAGE_KEY } from '../pages/TokenInspector';

function ChatInterface() {
  const chat = useChat();
  const sessions = useSessions();
  const characters = useCharacters();
  const persona = usePersona();
  const authorNote = useAuthorNote(sessions.currentSessionId);
  const navigate = useNavigate();
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
    // /medebug 命令：切换 memory debug 模式
    if (result.success && result.message === 'toggle_memory_debug') {
      chat.toggleMemoryDebug();
      return;
    }
    chat.addSystemMessage(result.message);
    // 如果是 compact 命令，刷新 token 用量
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 消息发送后刷新 token 用量
  const handleSendMessage = useCallback(async (msg: string) => {
    await chat.sendMessage(msg);
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 初始化同步：sessions 加载完后，加载当前会话的历史
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

  // memoryDebugInfo 变化时保存到 localStorage（供 TokenInspector 页面读取）
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

  /** 切换角色：切换到该角色的会话列表，不创建/不篡改现有会话 */
  const handleSwitchCharacter = useCallback(async (characterId: string) => {
    characters.setCurrentCharacterId(characterId);
    const list = await sessions.setCharacterFilter(characterId);

    if (list.length > 0) {
      // 优先恢复上次使用的会话，否则选最新的
      const lastSessionId = localStorage.getItem(`lastSession_${characterId}`);
      const targetId = (lastSessionId && list.some(s => s.session_id === lastSessionId))
        ? lastSessionId
        : list[0].session_id;
      sessions.setCurrentSessionId(targetId);
      await chat.loadHistory(targetId, characterId);
    } else {
      // 该角色没有会话 → 空状态，让用户手动点 +
      sessions.setCurrentSessionId(null);
      chat.resetChat();
      chat.setCurrentSessionId(null);
    }
  }, [sessions, characters, chat]);

  /** 跳转到角色管理页 */
  const handleManageCharacters = useCallback(() => {
    navigate('/settings/characters');
  }, [navigate]);

  /** 跳转到设置页 */
  const handleOpenSettings = useCallback(() => {
    navigate('/settings/config');
  }, [navigate]);

  /** 切换 Persona */
  const handleSwitchPersona = useCallback(async (personaId: string | null) => {
    await persona.switchTo(personaId);
  }, [persona]);

  /** 跳转到 Persona 管理页 */
  const handleManagePersonas = useCallback(() => {
    navigate('/settings/personas');
  }, [navigate]);

  /** 跳转到世界书管理页 */
  const handleManageWorldBooks = useCallback(() => {
    navigate('/settings/worldbooks');
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar
        sessions={sessions.sessions}
        currentSessionId={sessions.currentSessionId}
        isLoading={sessions.isLoading}
        onSelectSession={handleSwitchSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        formatLabel={sessions.formatSessionLabel}
        characters={characters.characters}
        currentCharacterId={characters.currentCharacterId}
        onSwitchCharacter={handleSwitchCharacter}
        onManageCharacters={handleManageCharacters}
        onOpenSettings={handleOpenSettings}
        personas={persona.personas}
        activePersonaId={persona.activeId}
        activePersonaName={persona.activeName}
        onSwitchPersona={handleSwitchPersona}
        onManagePersonas={handleManagePersonas}
        onManageWorldBooks={handleManageWorldBooks}
        authorNoteConfig={authorNote.config}
        authorNoteLoading={authorNote.isLoading}
        onAuthorNoteSaveContent={authorNote.saveContent}
        onAuthorNoteSetPosition={authorNote.setPosition}
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
        characterName={characters.currentCharacter?.display_name || characters.currentCharacter?.name}
        characterAvatar={characters.currentCharacter?.avatar}
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
    </div>
  );
}

export default ChatInterface;
