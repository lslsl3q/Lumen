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
    chat.addSystemMessage(result.message);
    // 如果是 compact 命令，刷新 token 用量
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 消息发送后刷新 token 用量
  const handleSendMessage = useCallback(async (msg: string) => {
    await chat.sendMessage(msg);
    refreshTokenUsage();
  }, [chat, refreshTokenUsage]);

  // 初始化同步：sessions 加载完后，把第一个会话的历史加载到 chat
  useEffect(() => {
    if (!sessions.isLoading && sessions.currentSessionId && !chat.currentSessionId) {
      chat.loadHistory(sessions.currentSessionId);
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

  /** 新建会话 */
  const handleNewSession = async () => {
    const newId = await sessions.createNewSession();
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
    const wasCurrent = sessionId === sessions.currentSessionId;
    await sessions.deleteSession(sessionId);

    if (wasCurrent) {
      if (sessions.currentSessionId) {
        await chat.loadHistory(sessions.currentSessionId);
      } else {
        chat.resetChat();
        chat.setCurrentSessionId(null);
      }
    }
  };

  /** 切换角色 */
  const handleSwitchCharacter = useCallback(async (characterId: string) => {
    if (sessions.currentSessionId) {
      await characters.switchCharacter(characterId, sessions.currentSessionId);
      // 切换角色后重新加载历史（新角色可能有不同的开场白）
      await chat.loadHistory(sessions.currentSessionId);
    } else {
      characters.setCurrentCharacterId(characterId);
    }
  }, [sessions.currentSessionId, characters, chat]);

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

  return (
    <div className="flex h-screen">
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
        authorNoteConfig={authorNote.config}
        authorNoteLoading={authorNote.isLoading}
        onAuthorNoteToggle={authorNote.toggle}
        onAuthorNoteSaveContent={authorNote.saveContent}
        onAuthorNoteSetPosition={authorNote.setPosition}
        onAuthorNoteRemove={authorNote.remove}
        onAuthorNoteCreate={() => authorNote.save({ enabled: false, content: '', injection_position: 'before_user' })}
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
    </div>
  );
}

export default ChatInterface;
