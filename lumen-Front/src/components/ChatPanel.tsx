/**
 * 聊天面板 — 纯渲染组件
 *
 * 职责：消息列表 + 输入框，所有状态来自 props
 * 从原 ChatInterface.tsx 提取而来
 */
import React, { useRef, useEffect, useState } from 'react';
import { Message, ToolCall } from '../hooks/useChat';
import MarkdownContent from './MarkdownContent';
import CommandPalette from './CommandPalette';
import { executeCommand } from '../commands/registry';
import '../commands/builtin'; // 副作用：注册内置命令
import { CommandResult } from '../commands/registry';
import { getAvatarUrl } from '../api/character';

/** AI 头像组件 */
function Avatar({ src, name, className = '' }: { src?: string | null; name?: string; className?: string }) {
  return (
    <div className={`w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center ${className}`}>
      {src ? (
        <img src={getAvatarUrl(src)!} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs text-amber-400">{(name || 'AI')[0]}</span>
      )}
    </div>
  );
}

/** 格式化工具结果数据用于展示 */
function formatResultData(data: unknown): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

/** 截断过长文本，保留前后部分 */
function truncateResult(text: string, maxLen = 500): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n... (共 ${text.length} 字符)`;
}

/** 思维链折叠气泡 — 暗色极简风格，与 ToolCallBlock 一致 */
function ThinkingBubble({ content, done }: { content: string; done: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!content) return null;

  return (
    <div className="flex justify-start pl-10 mb-2">
      <div
        className={`
          w-full max-w-[600px] rounded border border-amber-900/30 bg-amber-950/15
          transition-all duration-200 ease-out
        `}
      >
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {done ? (
              <svg className="w-3 h-3 text-amber-400/70 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="4" />
              </svg>
            ) : (
              <div className="w-3 h-3 rounded-full border-2 border-amber-500/60 border-t-transparent animate-spin flex-shrink-0" />
            )}
            <span className="text-xs text-amber-400/60 truncate">
              {done ? '思维过程' : '思考中...'}
            </span>
            {!done && content && (
              <span className="text-xs text-amber-500/40">{content.length}字</span>
            )}
          </div>
          <svg
            className={`w-3 h-3 text-amber-500/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 12 12"
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </div>
        {isExpanded && (
          <div className="px-3 pb-2 border-t border-amber-900/20">
            <pre className="text-xs text-amber-300/50 whitespace-pre-wrap break-words mt-2 max-h-60 overflow-y-auto">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/** 工具调用独立气泡 — 极简线条风格 + 渐进式信息 */
function ToolCallBlock({ call }: { call: ToolCall }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isRunning = call.status === 'running';
  const isDone = call.status === 'done';
  const isError = isDone && call.success === false;

  const bgColor = isRunning ? 'bg-slate-800/40' : isError ? 'bg-red-950/20' : 'bg-emerald-950/20';
  const textColor = isRunning ? 'text-slate-400' : isError ? 'text-red-400' : 'text-emerald-400';
  const borderColor = isRunning ? 'border-slate-700/40' : isError ? 'border-red-900/40' : 'border-emerald-900/40';

  // 参数摘要（折叠时显示）
  const paramsSummary = call.params
    ? Object.entries(call.params)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 20)}${JSON.stringify(v).length > 20 ? '...' : ''}`)
        .join(', ')
    : null;

  const resultText = isDone ? formatResultData(call.data) : '';

  return (
    <div className="flex justify-start pl-10 mb-2">
      <div
        className={`
          w-full max-w-[600px] rounded border ${borderColor} ${bgColor}
          transition-all duration-200 ease-out
          ${isRunning ? 'border-l-2 border-l-slate-500/60' : ''}
        `}
      >
        {/* 折叠/展开状态显示 */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* 状态指示器 */}
            {isRunning ? (
              <div className="w-3 h-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin flex-shrink-0" />
            ) : isError ? (
              <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="5" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="4" />
              </svg>
            )}

            {/* 工具名 + 参数摘要 */}
            <span className={`text-xs font-mono ${textColor} truncate`}>
              {call.name}
              {paramsSummary && !isExpanded && (
                <span className="text-slate-600"> {paramsSummary}</span>
              )}
            </span>
          </div>

          <div className={`text-xs text-slate-600 transition-transform duration-200 flex-shrink-0 ml-2 ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </div>
        </div>

        {/* 展开状态：详情信息 */}
        {isExpanded && (
          <div className="px-3 pb-2 space-y-2">
            {/* 参数详情 */}
            {call.params && Object.keys(call.params).length > 0 && (
              <div>
                <div className="text-xs text-slate-600 mb-1 font-medium">参数</div>
                <pre className="text-xs text-slate-400 font-mono bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(call.params, null, 2)}
                </pre>
              </div>
            )}

            {/* 执行结果 */}
            {resultText && (
              <div>
                <div className="text-xs text-slate-600 mb-1 font-medium">
                  {isError ? '错误详情' : '返回结果'}
                </div>
                <pre className={`text-xs font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap break-all ${
                  isError ? 'text-red-400 bg-red-950/30' : 'text-slate-400 bg-black/20'
                }`}>
                  {truncateResult(resultText)}
                </pre>
              </div>
            )}

            {/* 错误信息（简短版） */}
            {isError && call.error && !resultText && (
              <div>
                <div className="text-xs text-red-600 mb-1 font-medium">错误</div>
                <div className="text-xs text-red-400 font-mono bg-red-950/30 rounded p-2">
                  {call.error}
                </div>
              </div>
            )}

            {/* 运行中提示 */}
            {isRunning && (
              <div className="text-xs text-slate-500 italic">
                执行中...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 呼吸像素思考动画 */
function ThinkingIndicator({ characterName, characterAvatar }: {
  characterName?: string;
  characterAvatar?: string | null;
}) {
  return (
    <div className="flex justify-start items-start gap-2">
      <Avatar src={characterAvatar} name={characterName} />
      <div className="rounded-lg px-4 py-3 bg-slate-800/40 border border-amber-500/10">
        <div className="flex items-center gap-1">
          <span
            className="block w-1.5 h-1.5 animate-pixel-breathe"
            style={{
              color: 'transparent',
              boxShadow: '0 0 0 0 transparent',
              animationDelay: '0ms',
            }}
          >
            {/* 像素用 box-shadow 渲染，内容不可见 */}
          </span>
          <style>{`
            @keyframes pixelBreathe {
              0%, 100% {
                box-shadow:
                  0 0 0 0 transparent;
              }
              25% {
                box-shadow:
                  4px 0 0 0 rgba(45,212,191,0.3);
              }
              50% {
                box-shadow:
                  0 0 0 0 transparent,
                  4px 0 0 0 rgba(45,212,191,0.8),
                  -4px 0 0 0 rgba(45,212,191,0.8),
                  0 4px 0 0 rgba(45,212,191,0.8),
                  0 -4px 0 0 rgba(45,212,191,0.8);
              }
              75% {
                box-shadow:
                  4px 0 0 0 rgba(45,212,191,0.3);
              }
            }
            .animate-pixel-breathe {
              animation: pixelBreathe 2s steps(1) infinite;
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}

/** 单条消息气泡（不含工具调用） */
function MessageBubble({ message, characterName, characterAvatar }: {
  message: Message;
  characterName?: string;
  characterAvatar?: string | null;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-slate-500 font-mono px-4 py-1.5 bg-slate-800/30 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  // 没有文字内容就跳过（纯工具调用的消息）
  if (!message.content) return null;

  if (isUser) {
    return (
      <div className="flex justify-end items-start gap-2">
        <div className="max-w-[75%] rounded-lg px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-50">
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start items-start gap-2">
      <Avatar src={characterAvatar} name={characterName} />
      <div className="max-w-[75%] rounded-lg px-4 py-3 bg-slate-800/40 border border-amber-500/10 text-slate-200">
        <MarkdownContent
          content={message.content || (!message.isStreaming ? '(无文本回复)' : '')}
          isStreaming={message.isStreaming}
        />
      </div>
    </div>
  );
}

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  input: string;
  error: string | null;
  sessionId: string | null;
  tokenUsage?: { current_tokens: number; context_size: number; usage_percent: number } | null;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  onCommandResult?: (result: CommandResult) => void;
  onAbort?: () => void;
  characterName?: string;
  characterAvatar?: string | null;
}

function ChatPanel({
  messages,
  isLoading,
  input,
  error,
  sessionId,
  tokenUsage,
  onInputChange,
  onSendMessage,
  onCommandResult,
  onAbort,
  characterName,
  characterAvatar,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 流式完成后自动聚焦输入框
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const [showPalette, setShowPalette] = useState(false);

  // 是否正在思考（isLoading + 最后一条是空的 assistant）
  const lastMsg = messages[messages.length - 1];
  const isThinking = isLoading && messages.length > 0
    && lastMsg?.role === 'assistant'
    && !lastMsg.content
    && !(lastMsg.toolCalls && lastMsg.toolCalls.length > 0);

  // 核心发送逻辑（命令拦截 + 消息发送）
  const doSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // 斜杠命令拦截
    if (trimmed.startsWith('/')) {
      const result = await executeCommand(trimmed, { sessionId });
      onInputChange('');
      setShowPalette(false);
      if (result && onCommandResult) {
        onCommandResult(result);
      }
      return;
    }

    await onSendMessage(input);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
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
          <div className="w-2 h-2 rounded-full bg-primary-light shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
          <h1 className="text-lg font-light tracking-widest text-slate-300 uppercase">
            Lumen
          </h1>
        </div>
        {/* Token 用量 */}
        {tokenUsage && (
          <div className="flex items-center gap-2 ml-3">
            <div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  tokenUsage.usage_percent > 80 ? 'bg-red-500' :
                  tokenUsage.usage_percent > 50 ? 'bg-amber-500' :
                  'bg-teal-500'
                }`}
                style={{ width: `${Math.min(tokenUsage.usage_percent, 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-600 font-mono">
              {tokenUsage.usage_percent}%
            </span>
          </div>
        )}
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-lumen">
        {messages.length === 0 && !sessionId ? (
          // 空状态提示
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9 8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-slate-500 text-sm mb-2">暂无会话</p>
              <p className="text-slate-600 text-xs">点击左侧 "+" 按钮新建会话</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <React.Fragment key={message.id}>
                <MessageBubble message={message} characterName={characterName} characterAvatar={characterAvatar} />
                {message.thinkingContent && (
                  <ThinkingBubble content={message.thinkingContent} done={!!message.thinkingDone} />
                )}
                {message.toolCalls?.map((call) => (
                  <ToolCallBlock key={call.callId} call={call} />
                ))}
              </React.Fragment>
            ))}
            {/* 呼吸像素思考动画 */}
            {isThinking && (
              <ThinkingIndicator characterName={characterName} characterAvatar={characterAvatar} />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mb-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* 输入区域 */}
      <div className="px-6 py-4 border-t border-slate-800/60 relative">
        {!sessionId ? (
          // 无会话时的禁用提示
          <div className="text-center py-3">
            <p className="text-slate-600 text-xs">请先新建会话才能开始对话</p>
          </div>
        ) : (
          <>
            <CommandPalette
              input={input}
              visible={showPalette}
              onSelect={(name) => {
                onInputChange(`/${name} `);
                setShowPalette(false);
              }}
            />
            <form onSubmit={handleSubmit} className="flex items-center gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  handleInput(e);
                  setShowPalette(e.target.value.startsWith('/'));
                }}
                onKeyDown={handleKeyDown}
                placeholder="说点什么...  (输入 / 查看命令)"
                disabled={isLoading || !sessionId}
                rows={1}
                className="
                  flex-1 px-4 py-2.5 rounded-lg resize-none
                  bg-slate-900/60 border border-slate-700/40
                  text-slate-200 placeholder-slate-600 text-sm
                  focus:outline-hidden focus:border-amber-500/40 focus:shadow-[0_0_8px_rgba(204,124,94,0.1)]
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={onAbort}
                  className="
                    px-5 py-2.5 rounded-lg text-sm font-medium
                    bg-red-500/10 border border-red-500/30 text-red-400
                    hover:bg-red-500/20 hover:border-red-500/50
                    focus:outline-hidden
                    transition-all duration-200
                  "
                >
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || !sessionId}
                  className="
                    px-5 py-2.5 rounded-lg text-sm font-medium
                    bg-amber-500/10 border border-amber-500/30 text-amber-400
                    hover:bg-amber-500/20 hover:border-amber-500/50
                    focus:outline-hidden focus:shadow-[0_0_12px_rgba(204,124,94,0.15)]
                    disabled:opacity-30 disabled:cursor-not-allowed
                    transition-all duration-200
                  "
                >
                  发送
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ChatPanel;
