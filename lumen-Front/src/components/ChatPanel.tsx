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
import TokenRing from './TokenRing';
import { executeCommand, getAllCommands, parseCommand } from '../commands/registry';
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

  // 没有文字内容时：助手消息有工具调用 → 只显示头像（保持头像不消失）
  // 用户消息/系统消息无内容 → 跳过
  if (!message.content) {
    if (!isUser && message.toolCalls && message.toolCalls.length > 0) {
      return <Avatar src={characterAvatar} name={characterName} />;
    }
    return null;
  }

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
  onCompact?: () => void;
  onOpenConfig?: () => void;
  characterName?: string;
  characterAvatar?: string | null;
  currentModel?: string;
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
  onCompact,
  onOpenConfig,
  characterName,
  characterAvatar,
  currentModel,
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
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

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

  // Enter 发送，Shift+Enter 换行；palette 打开时拦截方向键/Enter/Escape
  const getFilteredCommands = () => {
    const commands = getAllCommands();
    const parsed = parseCommand(input);
    return parsed
      ? commands.filter((c) => c.name.startsWith(parsed!.name))
      : commands;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPalette) {
      const filtered = getFilteredCommands();

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPaletteIndex((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletteIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (filtered.length > 0) {
          const cmd = filtered[Math.min(paletteIndex, filtered.length - 1)];
          // 无参数命令直接执行，有参数的插入到输入框让用户补参数
          if (!cmd.usage) {
            onInputChange('');
            setShowPalette(false);
            setPaletteIndex(0);
            executeCommand(`/${cmd.name}`, { sessionId }).then((result) => {
              if (result && onCommandResult) onCommandResult(result);
            });
          } else {
            onInputChange(`/${cmd.name} `);
            setShowPalette(false);
            setPaletteIndex(0);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPalette(false);
        setPaletteIndex(0);
        return;
      }
    }

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
    ta.style.height = Math.min(ta.scrollHeight, 8 * 24 + 20) + 'px';
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-lumen">
        {messages.length === 0 && !sessionId ? (
          // 空状态提示
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
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
      <div className="px-4 pb-4 pt-3 relative">
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
              selectedIndex={paletteIndex}
              onSelect={(cmd) => {
                if (!cmd.usage) {
                  onInputChange('');
                  setShowPalette(false);
                  setPaletteIndex(0);
                  executeCommand(`/${cmd.name}`, { sessionId }).then((result) => {
                    if (result && onCommandResult) onCommandResult(result);
                  });
                } else {
                  onInputChange(`/${cmd.name} `);
                  setShowPalette(false);
                  setPaletteIndex(0);
                }
              }}
              onHover={(idx) => setPaletteIndex(idx)}
            />
            <div className="rounded-xl bg-slate-900/60 border border-slate-700/40 overflow-hidden
              focus-within:border-amber-500/30 focus-within:bg-slate-900/80
              focus-within:shadow-[0_0_12px_rgba(204,124,94,0.08)]
              transition-all duration-200">
              <form onSubmit={handleSubmit}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    handleInput(e);
                    const isSlash = e.target.value.startsWith('/');
                    setShowPalette(isSlash);
                    if (isSlash) setPaletteIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="说点什么..."
                  disabled={isLoading || !sessionId}
                  rows={1}
                  className="
                    w-full px-4 py-2.5 resize-none bg-transparent border-none
                    text-slate-200 placeholder-slate-600 text-sm leading-relaxed
                    focus:outline-hidden
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-all duration-200
                  "
                />
              </form>
              {/* 工具栏分割线 */}
              <div className="h-px bg-[#2a2926] mx-3" />
              {/* 工具栏 */}
              <div className="flex items-center gap-1 px-3 py-1.5">
                {/* 附件 */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center
                      text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
                      active:bg-slate-800/40
                      focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40
                      transition-all duration-150"
                    title="附件"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                  {showAttachMenu && (
                    <div className="absolute bottom-full left-0 mb-1 py-1 rounded-lg bg-slate-900 border border-slate-700/60 shadow-lg min-w-[140px] z-50">
                      <button
                        type="button"
                        onClick={() => setShowAttachMenu(false)}
                        className="w-full px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-left"
                      >
                        上传文件（开发中）
                      </button>
                    </div>
                  )}
                </div>
                {/* 斜杠命令 */}
                <button
                  type="button"
                  onClick={() => {
                    if (!showPalette) {
                      onInputChange('/');
                      setShowPalette(true);
                      setPaletteIndex(0);
                      inputRef.current?.focus();
                    } else {
                      setShowPalette(false);
                    }
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center
                    text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
                    active:bg-slate-800/40
                    focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40
                    transition-all duration-150"
                  title="斜杠命令"
                >
                  <span className="text-sm font-mono font-bold">/</span>
                </button>
                <div className="flex-1" />
                {/* 模型指示 */}
                {currentModel && (
                  <span className="text-[10px] text-slate-600 font-mono truncate max-w-24 px-1">
                    {currentModel}
                  </span>
                )}
                {/* Token 进度 */}
                {tokenUsage && (
                  <TokenRing
                    percent={tokenUsage.usage_percent}
                    current={tokenUsage.current_tokens}
                    total={tokenUsage.context_size}
                    onCompact={onCompact}
                    onOpenConfig={onOpenConfig}
                  />
                )}
                {/* 发送 / 停止 */}
                {isLoading ? (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="w-8 h-8 rounded-lg flex items-center justify-center
                      bg-red-500/15 border border-red-500/30 text-red-400
                      hover:bg-red-500/25 hover:border-red-500/50
                      focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-red-500/40
                      transition-all duration-200"
                    title="停止"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="3" width="10" height="10" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => doSend()}
                    disabled={!input.trim() || !sessionId}
                    className="w-8 h-8 rounded-lg flex items-center justify-center
                      bg-amber-500/15 border border-amber-500/30 text-amber-400
                      hover:bg-amber-500/25 hover:border-amber-500/50
                      disabled:opacity-30 disabled:cursor-not-allowed
                      focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40
                      transition-all duration-200"
                    title="发送"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ChatPanel;
