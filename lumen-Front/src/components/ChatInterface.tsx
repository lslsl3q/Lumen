/**
 * 聊天界面布局容器
 *
 * 职责：组合 Sidebar + ChatPanel，协调 useSessions、useChat、useCharacters 三个 hook 的数据流
 * 这是整个聊天页面的顶层组件
 */
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useSessions } from '../hooks/useSessions';
import { useCharacters } from '../hooks/useCharacters';
import ChatSidebar from './ChatSidebar';
import ChatPanel from './ChatPanel';

function ChatInterface() {
  const chat = useChat();
  const sessions = useSessions();
  const characters = useCharacters();
  const navigate = useNavigate();

  // 初始化同步：sessions 加载完后，把第一个会话的历史加载到 chat
  useEffect(() => {
    if (!sessions.isLoading && sessions.currentSessionId && !chat.currentSessionId) {
      chat.loadHistory(sessions.currentSessionId);
    }
  }, [sessions.isLoading, sessions.currentSessionId, chat.currentSessionId, chat.loadHistory]);

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

  /** 重置当前会话（清空历史，但会话 ID 不变） */
  const handleResetSession = async () => {
    if (!sessions.currentSessionId) return;

    try {
      await sessions.resetSession(sessions.currentSessionId);
      chat.resetChat();
      // 不需要重新加载历史，因为重置后历史就是空的
    } catch (err) {
      console.error('重置会话失败:', err);
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
      />
      <ChatPanel
        messages={chat.messages}
        isLoading={chat.isLoading}
        input={chat.input}
        error={chat.error}
        onInputChange={chat.setInput}
        onSendMessage={chat.sendMessage}
        onResetSession={handleResetSession}
      />
    </div>
  );
}

export default ChatInterface;
