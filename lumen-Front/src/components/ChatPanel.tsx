/**
 * 聊天面板 — 纯渲染组件
 *
 * 职责：消息列表 + 输入框，所有状态来自 props
 * 从原 ChatInterface.tsx 提取而来
 */
import React, { useRef, useEffect } from 'react';
import { Message, ToolCall } from '../hooks/useChat';
import MarkdownContent from './MarkdownContent';

/** 工具调用胶囊 */
function ToolPill({ call }: { call: ToolCall }) {
  const isRunning = call.status === 'running';
  const isError = call.status === 'done' && call.success === false;

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono
        border-l-2
        ${isRunning
          ? 'bg-amber-500/10 border-amber-500 text-amber-300'
          : isError
            ? 'bg-red-500/10 border-red-500 text-red-300'
            : 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
        }
      `}
    >
      {isRunning ? (
        <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin-slow" />
      ) : isError ? (
        <span>&#x2717;</span>
      ) : (
        <span>&#x2713;</span>
      )}
      <span>{call.name}</span>
      {isError && call.error && (
        <span className="text-red-400/70 ml-1 truncate max-w-[200px]">{call.error}</span>
      )}
    </div>
  );
}

/** 单条消息渲染 */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[75%] rounded-lg px-4 py-3
          ${isUser
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-50'
            : 'bg-slate-800/40 border border-teal-500/10 text-slate-200'
          }
        `}
      >
        {/* 文本内容 */}
        {isUser ? (
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        ) : (
          <MarkdownContent
            content={message.content || (!message.isStreaming ? '(无文本回复)' : '')}
            isStreaming={message.isStreaming}
          />
        )}

        {/* 工具调用胶囊 */}
        {hasToolCalls && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-700/40">
            {message.toolCalls!.map((call, i) => (
              <ToolPill key={`${call.name}-${i}`} call={call} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  input: string;
  error: string | null;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  onResetChat: () => void;
}

function ChatPanel({
  messages,
  isLoading,
  input,
  error,
  onInputChange,
  onSendMessage,
  onResetChat,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      await onSendMessage(input);
    }
  };

  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSendMessage(input);
      }
    }
  };

  // 自动增高（最多 5 行）
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 5 * 24 + 20) + 'px';
  };

  return (
    <div className="flex-1 flex flex-col bg-[radial-gradient(ellipse_at_center,#0f172a_0%,#000_100%)]">
      {/* 顶栏 */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
          <h1 className="text-lg font-light tracking-widest text-slate-300 uppercase">
            Lumen
          </h1>
        </div>
        <button
          onClick={onResetChat}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          新对话
        </button>
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-lumen">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mb-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* 输入区域 */}
      <div className="px-6 py-4 border-t border-slate-800/60">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <textarea
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="说点什么..."
            disabled={isLoading}
            rows={1}
            className="
              flex-1 px-4 py-2.5 rounded-lg resize-none
              bg-slate-900/60 border border-slate-700/40
              text-slate-200 placeholder-slate-600 text-sm
              focus:outline-none focus:border-teal-500/40 glow-teal
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200
            "
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="
              px-5 py-2.5 rounded-lg text-sm font-medium
              bg-teal-500/10 border border-teal-500/30 text-teal-400
              hover:bg-teal-500/20 hover:border-teal-500/50
              focus:outline-none focus:glow-teal
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-all duration-200
            "
          >
            {isLoading ? '...'.split('').map((c, i) => (
              <span
                key={i}
                className="inline-block animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                {c}
              </span>
            )) : '发送'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatPanel;
