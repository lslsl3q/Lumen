/**
 * 聊天界面布局容器
 *
 * 职责：组合 Sidebar + ChatPanel，协调 useSessions 和 useChat 两个 hook 的数据流
 * 这是整个聊天页面的顶层组件
 */
import { useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useSessions } from '../hooks/useSessions';
import ChatSidebar from './ChatSidebar';
import ChatPanel from './ChatPanel';

function ChatInterface() {
  const chat = useChat();
  const sessions = useSessions();

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
      // deleteSession 已经自动设了新的 currentSessionId（或 null）
      if (sessions.currentSessionId) {
        await chat.loadHistory(sessions.currentSessionId);
      } else {
        chat.resetChat();
        chat.setCurrentSessionId(null);
      }
    }
  };

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
      />
      <ChatPanel
        messages={chat.messages}
        isLoading={chat.isLoading}
        input={chat.input}
        error={chat.error}
        onInputChange={chat.setInput}
        onSendMessage={chat.sendMessage}
        onResetChat={chat.resetChat}
      />
    </div>
  );
}

export default ChatInterface;
