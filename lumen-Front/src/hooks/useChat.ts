/**
 * 聊天状态管理Hook
 */
import { useState, useCallback } from 'react';
import { sendMessage } from '../api/chat';

export interface Message {
  id: string;              // 唯一标识
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 生成唯一消息 ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'msg_init', role: 'assistant', content: '你好！我是 Lumen AI，有什么可以帮你的吗？' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sendMessageToAPI = useCallback(async (messageContent: string) => {
    if (!messageContent.trim()) return;

    // 添加用户消息（带唯一 ID）
    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: messageContent
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // 调用API
      const response = await sendMessage(messageContent);

      // 添加助手回复（带唯一 ID）
      const assistantMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: response.reply
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('发送消息失败:', err);
      setError('发送消息失败，请检查后端服务是否启动');
      // 移除用户消息（发送失败）
      setMessages(prev => prev.slice(0, -1));
      // 恢复输入框内容
      setInput(messageContent);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetChat = useCallback(() => {
    setMessages([
      { id: 'msg_init', role: 'assistant', content: '你好！我是 Lumen AI，有什么可以帮你的吗？' }
    ]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    input,
    setInput,
    sendMessage: sendMessageToAPI,
    resetChat,
    error
  };
}
