/**
 * ChatPanel — 三模式共享聊天面板
 *
 * 纯渲染组件（Dumb Component）：不直接访问任何 store，所有数据通过 props 传入。
 * 通过 features 配置控制渲染哪些 UI 元素，通过 renderMessage 插槽支持自定义消息渲染。
 *
 * 三模式用法：
 *   ChatMode    → features={CHAT_FEATURES}（全功能）
 *   WritingMode → features={WRITING_FEATURES}（工具+思维+多行，无驾驶舱/AN/命令）
 *   RPGMode     → features={RPG_FEATURES} + renderMessage={NarrativeMessage}
 */
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Message, ToolCall } from '../../types/chat';
import type { ChatPanelProps as SharedChatPanelProps } from './types';
import MarkdownContent from '../MarkdownContent';
import CockpitModelSelect from '../CockpitModelSelect';
import CommandPalette from '../CommandPalette';
import TokenRing from '../TokenRing';
import { executeCommand, getCommand, getAllCommands, parseCommand } from '../../commands/registry';
import '../../commands/builtin';
import { getAvatarUrl } from '../../utils/url';
import { toast } from '../../utils/toast';
import Tooltip from '../Tooltip';

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

function formatResultData(data: unknown): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function truncateResult(text: string, maxLen = 500): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n... (共 ${text.length} 字符)`;
}

/** 思维链折叠气泡 */
function ThinkingBubble({ content, done }: { content: string; done: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-2">
      <div className="w-full rounded border border-amber-900/30 bg-amber-950/15 transition-all duration-200 ease-out">
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

/** 工具调用 JSON 标记 */
const TOOL_JSON_MARKERS = [
  '{"type": "tool_call',
  '{"type":"tool_call',
  '{"type": "tool_call_parallel',
  '{"type":"tool_call_parallel',
  '{"calls":',
  '{"calls" :',
  '{"tool":',
  '{"tool" :',
];

interface ContentSegment {
  type: 'text' | 'tool_call' | 'think';
  text?: string;
  toolName?: string;
  toolCommand?: string;
  toolParams?: Record<string, unknown>;
  thinkContent?: string;
  thinkDone?: boolean;
}

function findJsonEnd(content: string, start: number): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

function extractCallsFromParsed(parsed: Record<string, unknown>): { name: string; command?: string; params: Record<string, unknown> }[] {
  const extractCommand = (c: Record<string, unknown>) => (typeof c.command === 'string' && c.command ? c.command : undefined);
  if (parsed.type === 'tool_call' && parsed.tool) {
    return [{ name: parsed.tool as string, command: extractCommand(parsed), params: (parsed.params as Record<string, unknown>) || {} }];
  }
  if ((parsed.type === 'tool_call_parallel' || parsed.type === 'tool_call') && Array.isArray(parsed.calls)) {
    return (parsed.calls as Record<string, unknown>[]).filter(c => c.tool).map(c => ({ name: c.tool as string, command: extractCommand(c as Record<string, unknown>), params: (c.params as Record<string, unknown>) || {} }));
  }
  if (Array.isArray(parsed.calls)) {
    return (parsed.calls as Record<string, unknown>[]).filter(c => c.tool).map(c => ({ name: c.tool as string, command: extractCommand(c as Record<string, unknown>), params: (c.params as Record<string, unknown>) || {} }));
  }
  if (parsed.tool) {
    return [{ name: parsed.tool as string, command: extractCommand(parsed), params: (parsed.params as Record<string, unknown>) || {} }];
  }
  return [];
}

const THINK_OPEN_RE = /<think(?:ing)?[^>]*>/;
const THINK_CLOSE_RE = /<\/think(?:ing)?\s*>/;

function splitThinkTags(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let pos = 0;

  while (pos < content.length) {
    const rest = content.slice(pos);
    const openMatch = rest.match(THINK_OPEN_RE);
    if (!openMatch) {
      const text = rest.trim();
      if (text) segments.push({ type: 'text', text });
      break;
    }

    const openStart = pos + openMatch.index!;
    const openEnd = openStart + openMatch[0].length;

    const before = content.slice(pos, openStart).trim();
    if (before) segments.push({ type: 'text', text: before });

    const afterOpen = content.slice(openEnd);
    const closeMatch = afterOpen.match(THINK_CLOSE_RE);
    if (closeMatch) {
      const thinkContent = afterOpen.slice(0, closeMatch.index!).trim();
      if (thinkContent) segments.push({ type: 'think', thinkContent, thinkDone: true });
      pos = openEnd + closeMatch.index! + closeMatch[0].length;
    } else {
      const thinkContent = afterOpen.trim();
      if (thinkContent) segments.push({ type: 'think', thinkContent, thinkDone: false });
      break;
    }
  }

  return segments.length > 0 ? segments : [{ type: 'text', text: content }];
}

function splitContentSegments(content: string, excludeToolCalls: boolean = false): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let pos = 0;

  while (pos < content.length) {
    let earliestIdx = -1;
    for (const marker of TOOL_JSON_MARKERS) {
      const idx = content.indexOf(marker, pos);
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
      }
    }

    if (earliestIdx === -1) {
      const text = content.slice(pos).trim();
      if (text) segments.push({ type: 'text', text });
      break;
    }

    let beforeText = content.slice(pos, earliestIdx);
    const inCodeBlock = /```[\w]*\s*\n?\s*$/.test(beforeText);
    if (inCodeBlock) {
      beforeText = beforeText.replace(/\n?```[\w]*\s*$/, '');
    }

    const trimmedBefore = beforeText.trim();
    if (trimmedBefore) segments.push({ type: 'text', text: trimmedBefore });

    const jsonEnd = findJsonEnd(content, earliestIdx);
    if (jsonEnd === -1) {
      const text = content.slice(earliestIdx).trim();
      if (text) segments.push({ type: 'text', text });
      break;
    }

    let afterPos = jsonEnd;
    const afterContent = content.slice(jsonEnd);
    const codeFenceClose = afterContent.match(/^\n?\n?```/);
    if (codeFenceClose) {
      afterPos = jsonEnd + codeFenceClose[0].length;
    }

    try {
      const parsed = JSON.parse(content.slice(earliestIdx, jsonEnd));
      const calls = extractCallsFromParsed(parsed as Record<string, unknown>);
      if (calls.length > 0) {
        if (!excludeToolCalls) {
          for (const call of calls) {
            segments.push({ type: 'tool_call', toolName: call.name, toolCommand: call.command, toolParams: call.params });
          }
        }
      } else {
        segments.push({ type: 'text', text: content.slice(earliestIdx, jsonEnd) });
      }
    } catch {
      segments.push({ type: 'text', text: content.slice(earliestIdx, jsonEnd) });
    }

    pos = afterPos;
  }

  return segments.length > 0 ? segments : [{ type: 'text', text: content }];
}

/** 工具调用气泡 */
function ToolCallBlock({ call, inline }: { call: ToolCall; inline?: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isRunning = call.status === 'running';
  const isDone = call.status === 'done';
  const isError = isDone && call.success === false;

  const bgColor = isRunning ? 'bg-slate-800/40' : isError ? 'bg-red-950/20' : 'bg-emerald-950/20';
  const textColor = isRunning ? 'text-slate-400' : isError ? 'text-red-400' : 'text-emerald-400';
  const borderColor = isRunning ? 'border-slate-700/40' : isError ? 'border-red-900/40' : 'border-emerald-900/40';

  const paramsSummary = call.params
    ? Object.entries(call.params)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 20)}${JSON.stringify(v).length > 20 ? '...' : ''}`)
        .join(', ')
    : null;

  const resultText = isDone ? formatResultData(call.data) : '';

  return (
    <div className={inline ? 'my-1' : 'flex justify-start pl-10 mb-2'}>
      <div className={`w-full max-w-[600px] rounded border ${borderColor} ${bgColor} transition-all duration-200 ease-out ${isRunning ? 'border-l-2 border-l-slate-500/60' : ''}`}>
        <div className="flex items-center justify-between px-3 py-2 cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-2 min-w-0">
            {isRunning ? (
              <div className="w-3 h-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin flex-shrink-0" />
            ) : isError ? (
              <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" /></svg>
            ) : (
              <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" /></svg>
            )}
            <span className={`text-xs font-mono ${textColor} truncate`}>
              {call.command ? `${call.name}:${call.command}` : call.name}
              {paramsSummary && !isExpanded && (<span className="text-slate-600"> {paramsSummary}</span>)}
            </span>
          </div>
          <div className={`text-xs text-slate-600 transition-transform duration-200 flex-shrink-0 ml-2 ${isExpanded ? 'rotate-90' : ''}`}>▶</div>
        </div>
        {isExpanded && (
          <div className="px-3 pb-2 space-y-2">
            {call.params && Object.keys(call.params).length > 0 && (
              <div>
                <div className="text-xs text-slate-600 mb-1 font-medium">参数</div>
                <pre className="text-xs text-slate-400 font-mono bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(call.params, null, 2)}</pre>
              </div>
            )}
            {resultText && (
              <div>
                <div className="text-xs text-slate-600 mb-1 font-medium">{isError ? '错误详情' : '返回结果'}</div>
                <pre className={`text-xs font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap break-all ${isError ? 'text-red-400 bg-red-950/30' : 'text-slate-400 bg-black/20'}`}>{truncateResult(resultText)}</pre>
              </div>
            )}
            {isError && call.error && !resultText && (
              <div>
                <div className="text-xs text-red-600 mb-1 font-medium">错误</div>
                <div className="text-xs text-red-400 font-mono bg-red-950/30 rounded p-2">{call.error}</div>
              </div>
            )}
            {isRunning && <div className="text-xs text-slate-500 italic">执行中...</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** 内联消息内容 — 将思维链、文本和工具调用按顺序渲染 */
function InlineMessageContent({ content, isStreaming, excludeToolCalls, showThinking, showTools }: {
  content: string;
  isStreaming?: boolean;
  excludeToolCalls?: boolean;
  showThinking?: boolean;
  showTools?: boolean;
}) {
  const segments = useMemo(() => {
    const thinkSegs = splitThinkTags(content);
    const result: ContentSegment[] = [];
    for (const seg of thinkSegs) {
      if (seg.type === 'think') {
        result.push(seg);
      } else {
        result.push(...splitContentSegments(seg.text || '', excludeToolCalls));
      }
    }
    return result;
  }, [content, excludeToolCalls]);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'think') {
          if (!showThinking) return null;
          return <ThinkingBubble key={`think_${i}`} content={seg.thinkContent || ''} done={seg.thinkDone ?? true} />;
        }
        if (seg.type === 'tool_call') {
          if (!showTools) return null;
          return (
            <ToolCallBlock
              key={`tool_${i}`}
              call={{ callId: i, name: seg.toolName!, command: seg.toolCommand, status: 'done' as const, params: seg.toolParams || {} }}
              inline
            />
          );
        }
        return <MarkdownContent key={i} content={seg.text!} isStreaming={isStreaming} />;
      })}
    </>
  );
}

/** 按 steps 数组顺序渲染助手消息 */
function renderStepsContent(message: Message, showThinking: boolean, showTools: boolean) {
  const steps = message.steps;

  if (steps && steps.length > 0) {
    return <>
      {steps.map((step, i) => {
        switch (step.type) {
          case 'think':
            if (!showThinking) return null;
            return step.content ? (
              <ThinkingBubble key={`think_${step.id}`} content={step.content} done={step.done} />
            ) : null;
          case 'tool':
            if (!showTools) return null;
            return (
              <ToolCallBlock
                key={`tool_${step.id}`}
                call={{
                  callId: step.id,
                  name: step.name,
                  command: step.command,
                  status: step.status,
                  success: step.success,
                  params: step.params,
                  error: step.error,
                  data: step.data,
                }}
                inline
              />
            );
          case 'text':
            return step.content.trim() ? (
              <div key={`text_${step.id}`} className={i > 0 ? 'mt-2' : ''}>
                <InlineMessageContent
                  content={step.content}
                  isStreaming={message.isStreaming && i === steps.length - 1}
                  showThinking={showThinking}
                  showTools={showTools}
                />
              </div>
            ) : null;
          default:
            return null;
        }
      })}
    </>;
  }

  return <FallbackContent message={message} showThinking={showThinking} showTools={showTools} />;
}

function FallbackContent({ message, showThinking, showTools }: { message: Message; showThinking: boolean; showTools: boolean }) {
  if (message.thinkingContent) {
    return <>
      {showThinking && <ThinkingBubble content={message.thinkingContent} done={!!message.thinkingDone} />}
      {showTools && message.toolCalls && message.toolCalls.length > 0 ? (
        <div>
          {message.toolCalls.map(call => <ToolCallBlock key={call.callId} call={call} inline />)}
          {message.content && message.content.trim() !== '' && (
            <div className="mt-2">
              <InlineMessageContent content={message.content} excludeToolCalls={true} showThinking={showThinking} showTools={showTools} />
            </div>
          )}
        </div>
      ) : (
        <InlineMessageContent content={message.content || ''} showThinking={showThinking} showTools={showTools} />
      )}
    </>;
  }
  if (showTools && message.toolCalls && message.toolCalls.length > 0) {
    return (
      <div>
        {message.toolCalls.map(call => <ToolCallBlock key={call.callId} call={call} inline />)}
        {message.content && message.content.trim() !== '' && (
          <div className="mt-2">
            <InlineMessageContent content={message.content} excludeToolCalls={true} showThinking={showThinking} showTools={showTools} />
          </div>
        )}
      </div>
    );
  }
  return <InlineMessageContent content={message.content || ''} isStreaming={message.isStreaming} showThinking={showThinking} showTools={showTools} />;
}

/** 呼吸像素思考动画 */
function ThinkingIndicator({ characterName, characterAvatar }: { characterName?: string; characterAvatar?: string | null }) {
  return (
    <div className="flex justify-start items-start gap-2">
      <Avatar src={characterAvatar} name={characterName} />
      <div className="rounded-lg px-4 py-3 bg-slate-800/40 border border-amber-500/10">
        <div className="flex items-center gap-1">
          <span className="block w-1.5 h-1.5 animate-pixel-breathe" style={{ color: 'transparent', boxShadow: '0 0 0 0 transparent', animationDelay: '0ms' }} />
          <style>{`
            @keyframes pixelBreathe {
              0%, 100% { box-shadow: 0 0 0 0 transparent; }
              25% { box-shadow: 4px 0 0 0 rgba(45,212,191,0.3); }
              50% { box-shadow: 0 0 0 0 transparent, 4px 0 0 0 rgba(45,212,191,0.8), -4px 0 0 0 rgba(45,212,191,0.8), 0 4px 0 0 rgba(45,212,191,0.8), 0 -4px 0 0 rgba(45,212,191,0.8); }
              75% { box-shadow: 4px 0 0 0 rgba(45,212,191,0.3); }
            }
            .animate-pixel-breathe { animation: pixelBreathe 2s steps(1) infinite; }
          `}</style>
        </div>
      </div>
    </div>
  );
}

/** 单条消息气泡 */
function MessageBubble({ message, characterName, characterAvatar, editingId, editContent, onContextMenu, onSaveEdit, onCancelEdit, onEditChange, showThinking, showTools }: {
  message: Message;
  characterName?: string;
  characterAvatar?: string | null;
  editingId: string | null;
  editContent: string;
  onContextMenu: (messageId: string, e: React.MouseEvent) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (content: string) => void;
  showThinking: boolean;
  showTools: boolean;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isEditing = editingId === message.id;

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-slate-500 font-mono px-4 py-1.5 bg-slate-800/30 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  if (!message.content || message.content.trim() === '') {
    if (!isUser && (message.steps?.length || message.toolCalls?.length || message.thinkingContent)) {
      return (
        <div className="flex justify-start items-start gap-2" onContextMenu={e => e.preventDefault()}>
          <Avatar src={characterAvatar} name={characterName} />
          <div className="max-w-[75%]" data-message-bubble="true"
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(message.id, e); }}>
            {renderStepsContent(message, showThinking, showTools)}
          </div>
        </div>
      );
    }
    return null;
  }

  if (isEditing) {
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-start gap-2`}>
        {!isUser && <Avatar src={characterAvatar} name={characterName} />}
        <div className="w-full max-w-[75%] min-w-[200px] flex flex-col gap-2">
          <textarea
            value={editContent}
            onChange={e => onEditChange(e.target.value)}
            className="w-full rounded-lg px-4 py-3 bg-slate-800/60 border border-amber-500/30
              text-slate-200 text-sm leading-relaxed resize-none outline-none focus:border-amber-500/50"
            rows={Math.max(2, Math.min(editContent.split('\n').length, 10))}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={onCancelEdit} className="px-3 py-1 rounded-lg text-xs cursor-pointer text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors">取消</button>
            <button onClick={onSaveEdit} className="px-3 py-1 rounded-lg text-xs cursor-pointer bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors">保存</button>
          </div>
        </div>
        {isUser && <div className="w-8 h-8 flex-shrink-0" />}
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end items-start gap-2" onContextMenu={e => e.preventDefault()}>
        <div className="max-w-[75%] rounded-lg px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-50"
          data-message-bubble="true"
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(message.id, e); }}>
          <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
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
    <div className="flex justify-start items-start gap-2" onContextMenu={e => e.preventDefault()}>
      <Avatar src={characterAvatar} name={characterName} />
      <div className="max-w-[75%] rounded-lg px-4 py-3 bg-slate-800/40 border border-amber-500/10 text-slate-200"
        data-message-bubble="true"
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(message.id, e); }}>
        {renderStepsContent(message, showThinking, showTools)}
      </div>
    </div>
  );
}

/** 回复风格配置 */
const RESPONSE_STYLES = [
  { key: 'brief', label: '简短', icon: '–' },
  { key: 'balanced', label: '默认', icon: '≈' },
  { key: 'detailed', label: '详细', icon: '≡' },
] as const;

/** 共享 ChatPanel 主组件 */
function SharedChatPanel(props: SharedChatPanelProps) {
  const {
    features,
    messages,
    isLoading,
    input,
    setInput: onInputChange,
    sendMessage: onSendMessage,
    abort: onAbort,
    error,
    cockpitConfig,
    authorNoteConfig,
    contextMenuHandlers,
    onCommandResult,
    renderMessage,
    emptyStateContent,
    inputPlaceholder,
    className,
  } = props;

  // sessionId 在共享版中不使用（各模式通过 hook 管理）
  const characterName = cockpitConfig?.characterName;
  const characterAvatar = cockpitConfig?.characterAvatar;
  const currentModel = cockpitConfig?.currentModel;
  const onModelChange = cockpitConfig?.onModelChange;
  const tokenUsage = features.tokenUsage ? cockpitConfig?.tokenUsage : undefined;
  const onCompact = cockpitConfig?.onCompact;
  const onOpenMonitor = cockpitConfig?.onOpenMonitor;
  const responseStyle = cockpitConfig?.responseStyle || 'balanced';
  const onResponseStyleChange = cockpitConfig?.onResponseStyleChange;

  const onEditMessage = contextMenuHandlers?.onEditMessage;
  const onDeleteMessage = contextMenuHandlers?.onDeleteMessage;
  const onRegenerateMessage = contextMenuHandlers?.onRegenerateMessage;
  const onBranchFromMessage = contextMenuHandlers?.onBranchFromMessage;

  const anConfig = authorNoteConfig?.config;
  const onAnSaveContent = authorNoteConfig?.onSaveContent;
  const onAnSetPosition = authorNoteConfig?.onSetPosition;

  const showThinking = features.thinkingRendering;
  const showTools = features.toolRendering;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [contextMenu, setContextMenu] = useState<{ messageId: string | null; x: number; y: number } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const skipScrollRef = useRef(false);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  const [showPalette, setShowPalette] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showAnEditor, setShowAnEditor] = useState(false);
  const [anContent, setAnContent] = useState('');
  const inputContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  useEffect(() => {
    if (anConfig) setAnContent(anConfig.content);
  }, [anConfig]);

  const handleContextMenu = (messageId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 160;
    const menuHeight = 160;
    const x = e.clientX + menuWidth > window.innerWidth ? e.clientX - menuWidth : e.clientX;
    const y = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;
    setContextMenu({ messageId, x, y });
  };

  const handleStartEdit = (messageId?: string, content?: string) => {
    const mid = messageId || contextMenu?.messageId;
    if (!mid) return;
    const msg = messages.find(m => m.id === mid);
    setEditingMessageId(mid);
    setEditContent(content ?? msg?.content ?? '');
    setContextMenu(null);
  };

  const handleSaveEdit = () => {
    if (editingMessageId && onEditMessage) {
      skipScrollRef.current = true;
      onEditMessage(editingMessageId, editContent.trim());
    }
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleDeleteMessage = () => {
    if (contextMenu?.messageId && onDeleteMessage) {
      skipScrollRef.current = true;
      onDeleteMessage(contextMenu.messageId);
    }
    setContextMenu(null);
  };

  const handleRegenerate = () => {
    if (contextMenu?.messageId && onRegenerateMessage) {
      onRegenerateMessage(contextMenu.messageId);
    }
    setContextMenu(null);
  };

  const handleBranch = async () => {
    if (contextMenu?.messageId && onBranchFromMessage) {
      const newSessionId = await onBranchFromMessage(contextMenu.messageId);
      if (newSessionId) toast('已创建分支会话', 'success');
    }
    setContextMenu(null);
  };

  const cycleResponseStyle = () => {
    const idx = RESPONSE_STYLES.findIndex(s => s.key === responseStyle);
    const next = RESPONSE_STYLES[(idx + 1) % RESPONSE_STYLES.length];
    onResponseStyleChange?.(next.key);
    toast(`回复风格：${next.label}`, 'info');
  };

  const lastMsg = messages[messages.length - 1];
  const isThinking = isLoading && messages.length > 0
    && lastMsg?.role === 'assistant'
    && !lastMsg.content
    && !lastMsg.steps?.length
    && !(lastMsg.toolCalls && lastMsg.toolCalls.length > 0);

  const doSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    if (features.commands && trimmed.startsWith('/')) {
      const parsed = parseCommand(trimmed);
      if (parsed && getCommand(parsed.name)) {
        const result = await executeCommand(trimmed, { sessionId: null });
        onInputChange('');
        setShowPalette(false);
        if (result && onCommandResult) onCommandResult(result);
        return;
      }
    }

    await onSendMessage(input);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  const getFilteredCommands = () => {
    const commands = getAllCommands();
    const parsed = parseCommand(input);
    return parsed ? commands.filter(c => c.name.startsWith(parsed!.name)) : commands;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPalette && features.commands) {
      const filtered = getFilteredCommands();

      if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(prev => (prev + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(prev => (prev - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (filtered.length > 0) {
          const cmd = filtered[Math.min(paletteIndex, filtered.length - 1)];
          if (!cmd.usage) {
            onInputChange(''); setShowPalette(false); setPaletteIndex(0);
            executeCommand(`/${cmd.name}`, { sessionId: null }).then(result => { if (result && onCommandResult) onCommandResult(result); });
          } else {
            onInputChange(`/${cmd.name} `); setShowPalette(false); setPaletteIndex(0);
          }
        }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowPalette(false); setPaletteIndex(0); return; }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 8 * 24 + 20) + 'px';
  };

  // 默认空状态
  const defaultEmptyState = (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm mb-2">暂无消息</p>
        <p className="text-slate-600 text-xs">输入消息开始对话</p>
      </div>
    </div>
  );

  return (
    <div className={`flex-1 flex flex-col bg-slate-950 ${className || ''}`}>
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-lumen" onContextMenu={e => e.preventDefault()}>
        {messages.length === 0 ? (
          features.emptyState ? (emptyStateContent || defaultEmptyState) : null
        ) : (
          <>
            {messages.map((message, index) => (
              <React.Fragment key={message.id}>
                {renderMessage ? (
                  renderMessage(message, index)
                ) : (
                  <MessageBubble
                    message={message}
                    characterName={characterName}
                    characterAvatar={characterAvatar}
                    editingId={editingMessageId}
                    editContent={editContent}
                    onContextMenu={features.contextMenu ? handleContextMenu : () => {}}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onEditChange={setEditContent}
                    showThinking={showThinking}
                    showTools={showTools}
                  />
                )}
              </React.Fragment>
            ))}
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
        <div ref={inputContainerRef}
          className="rounded-xl bg-slate-900/60 border border-slate-700/40 overflow-hidden
            focus-within:border-amber-500/30 focus-within:bg-slate-900/80
            focus-within:shadow-[0_0_12px_rgba(204,124,94,0.08)]
            transition-all duration-200"
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => {
            setTimeout(() => {
              if (!inputContainerRef.current?.contains(document.activeElement)) {
                const slot = (document.activeElement as HTMLElement)?.closest(
                  '[data-slot="popover-content"], [data-slot="command"], [data-slot="context-menu-content"]'
                );
                if (!slot) setIsInputFocused(false);
              }
            }, 0);
          }}>
          <form onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                if (features.multilineInput) handleInput(e);
                else onInputChange(e.target.value);
                if (features.commands) {
                  const isSlash = e.target.value.startsWith('/');
                  setShowPalette(isSlash);
                  if (isSlash) setPaletteIndex(0);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder || '说点什么...'}
              disabled={isLoading}
              rows={1}
              className="w-full px-4 py-2.5 resize-none bg-transparent border-none
                text-slate-200 placeholder-slate-600 text-sm leading-relaxed
                focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            />
          </form>

          {/* 驾驶舱 — 仅 features.cockpit 时渲染 */}
          {features.cockpit && (
            <div className="grid"
              style={{
                gridTemplateRows: isInputFocused ? '1fr' : '0fr',
                opacity: isInputFocused ? 1 : 0,
                transition: 'grid-template-rows 150ms ease-out, opacity 150ms ease-out',
              }}>
              <div className="overflow-hidden min-h-0">
                <div className="h-px bg-[#2a2926] mx-3" />
                <div className="flex items-center gap-2 px-3 py-1">
                  <CockpitModelSelect value={currentModel || ''} onChange={onModelChange || (() => {})} />
                  {tokenUsage && (
                    <TokenRing percent={tokenUsage.usage_percent} current={tokenUsage.current_tokens} total={tokenUsage.context_size} onCompact={onCompact} onOpenMonitor={onOpenMonitor} />
                  )}
                  <Tooltip text={`回复风格: ${RESPONSE_STYLES.find(s => s.key === responseStyle)?.label || '默认'}`}>
                    <button type="button" onClick={cycleResponseStyle}
                      className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all duration-150 cursor-pointer">
                      <span className="text-xs font-mono">{RESPONSE_STYLES.find(s => s.key === responseStyle)?.icon || '≈'}</span>
                    </button>
                  </Tooltip>
                  <div className="flex-1" />
                  {features.authorNote && (
                    <Tooltip text="Author's Note">
                      <button type="button" onClick={() => setShowAnEditor(prev => !prev)}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-all duration-150 cursor-pointer
                          ${showAnEditor ? 'text-amber-400 bg-amber-500/15'
                            : anConfig?.enabled ? 'text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    </Tooltip>
                  )}
                </div>
                {/* AN 编辑器 */}
                {features.authorNote && showAnEditor && (
                  <div className="px-3 pb-2 space-y-1.5">
                    <textarea value={anContent}
                      onChange={(e) => { setAnContent(e.target.value); onAnSaveContent?.(e.target.value); }}
                      placeholder="Author's Note 内容..." rows={2}
                      className="w-full rounded-lg px-3 py-2 bg-slate-800/40 border border-slate-700/30
                        text-slate-300 text-xs leading-relaxed resize-none outline-none
                        focus:border-amber-500/30 transition-colors placeholder-slate-600" />
                    <div className="flex items-center gap-2 text-[10px] text-slate-600">
                      <span>注入:</span>
                      <button type="button" onClick={() => onAnSetPosition?.('before_user')}
                        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors
                          ${anConfig?.injection_position === 'before_user' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'}`}>用户前</button>
                      <button type="button" onClick={() => onAnSetPosition?.('after_user')}
                        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors
                          ${anConfig?.injection_position === 'after_user' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'}`}>用户后</button>
                      {anConfig?.enabled && anContent.trim() && <span className="ml-auto text-amber-500/60">已启用</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 工具栏分割线 */}
          <div className="h-px bg-[#2a2926] mx-3" />
          {/* 工具栏 */}
          <div className="flex items-center gap-1 px-3 py-1.5">
            {/* 附件 */}
            <Tooltip text="附件">
              <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 active:bg-slate-800/40 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40 transition-all duration-150">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </Tooltip>
            {showAttachMenu && (
              <div className="absolute bottom-full left-3 mb-1 py-1 rounded-lg bg-slate-900 border border-slate-700/60 shadow-lg min-w-[140px] z-50">
                <button type="button" onClick={() => setShowAttachMenu(false)}
                  className="w-full px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-left">上传文件（开发中）</button>
              </div>
            )}
            {/* 斜杠命令 — 仅 features.commands 时渲染 */}
            {features.commands && (
              <Tooltip text="斜杠命令">
                <button type="button" onClick={() => {
                  if (!showPalette) {
                    onInputChange('/'); setShowPalette(true); setPaletteIndex(0); inputRef.current?.focus();
                  } else {
                    setShowPalette(false);
                  }
                }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 active:bg-slate-800/40 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40 transition-all duration-150">
                  <span className="text-sm font-mono font-bold">/</span>
                </button>
              </Tooltip>
            )}
            {/* 命令面板 */}
            {features.commands && (
              <CommandPalette input={input} visible={showPalette} selectedIndex={paletteIndex}
                onSelect={(cmd) => {
                  if (!cmd.usage) {
                    onInputChange(''); setShowPalette(false); setPaletteIndex(0);
                    executeCommand(`/${cmd.name}`, { sessionId: null }).then(result => { if (result && onCommandResult) onCommandResult(result); });
                  } else {
                    onInputChange(`/${cmd.name} `); setShowPalette(false); setPaletteIndex(0);
                  }
                }}
                onHover={(idx) => setPaletteIndex(idx)} />
            )}
            <div className="flex-1" />
            {/* 发送 / 停止 */}
            {isLoading ? (
              <Tooltip text="停止">
                <button type="button" onClick={onAbort}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:border-red-500/50 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-red-500/40 transition-all duration-200">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" /></svg>
                </button>
              </Tooltip>
            ) : (
              <Tooltip text="发送">
                <button type="button" onClick={() => doSend()} disabled={!input.trim()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40 transition-all duration-200">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* 右键菜单 — 仅 features.contextMenu 时渲染 */}
      {features.contextMenu && contextMenu && createPortal(
        <div data-context-menu="true"
          className="fixed z-[200] bg-[#1f1f1c] border border-[#2a2926] rounded-lg shadow-xl py-1 min-w-[140px] flex flex-col"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}>
          <button onClick={() => { handleStartEdit(); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 cursor-pointer transition-colors">编辑消息</button>
          {contextMenu.messageId && messages.find(m => m.id === contextMenu.messageId)?.role === 'assistant' && (
            <button onClick={handleRegenerate}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-slate-700/40 cursor-pointer transition-colors">重新回复</button>
          )}
          <button onClick={handleBranch}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-slate-700/40 cursor-pointer transition-colors">创建分支</button>
          <button onClick={handleDeleteMessage}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-400/08 cursor-pointer transition-colors">删除此条消息</button>
        </div>,
        document.body
      )}
    </div>
  );
}

export { SharedChatPanel };
export default SharedChatPanel;
