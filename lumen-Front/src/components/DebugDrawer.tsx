/**
 * DebugDrawer — 右侧调试抽屉
 *
 * /medebug 命令触发，右侧滑出面板
 * 两个标签页：Token 分析 / 记忆召回
 */
import { useState } from 'react';
import type { MemoryDebugLayer } from './PromptDebugPanel';
import type { RecallLogEntry } from '../hooks/useChat';

interface DebugDrawerProps {
  open: boolean;
  onClose: () => void;
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
  recallLog: RecallLogEntry[] | null;
}

function getBarColor(percent: number): string {
  if (percent > 80) return 'bg-red-500';
  if (percent > 50) return 'bg-amber-500';
  return 'bg-teal-500';
}

function getTokenTextColor(tokens: number): string {
  if (tokens > 500) return 'text-orange-400';
  if (tokens >= 100) return 'text-amber-400';
  return 'text-emerald-400';
}

/** 标签页：Token 分析 */
function TokenTab({ layers, totalTokens, contextSize }: {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
}) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const percent = contextSize > 0 ? Math.round((totalTokens / contextSize) * 100) : 0;

  return (
    <div className="p-4 space-y-3">
      {/* 总进度条 */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-400">上下文使用</span>
          <span className="font-mono text-slate-300">
            {totalTokens} / {contextSize} ({percent}%)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getBarColor(percent)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>

      {/* 各层列表 */}
      <div className="space-y-1">
        {layers.map((layer) => (
          <div key={layer.name} className="rounded border border-slate-800/60 overflow-hidden">
            <button
              onClick={() => setExpandedLayer(expandedLayer === layer.name ? null : layer.name)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800/40 transition-colors cursor-pointer"
            >
              <span className="text-slate-400">{layer.name}</span>
              <div className="flex items-center gap-2">
                <span className={`font-mono ${getTokenTextColor(layer.tokens)}`}>{layer.tokens}</span>
                <span className={`text-slate-600 transition-transform duration-200 ${expandedLayer === layer.name ? 'rotate-90' : ''}`}>▶</span>
              </div>
            </button>
            {expandedLayer === layer.name && (
              <pre className="px-3 py-2 text-xs text-slate-500 bg-slate-950/50 whitespace-pre-wrap break-words max-h-60 overflow-y-auto border-t border-slate-800/40">
                {layer.content}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 标签页：记忆召回 */
function RecallTab({ recallLog }: { recallLog: RecallLogEntry[] | null }) {
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null);

  if (!recallLog || recallLog.length === 0) {
    return (
      <div className="p-4 text-center text-slate-600 text-sm">
        没有匹配的记忆召回
      </div>
    );
  }

  // 关键词药丸
  const allKeywords = recallLog
    .filter(e => e.source === 'sqlite')
    .map(e => e.keyword);
  const totalTokens = recallLog.reduce((sum, e) => sum + e.tokens, 0);
  const totalMessages = recallLog.reduce((sum, e) => sum + e.results, 0);

  return (
    <div className="p-4 space-y-3">
      {/* 关键词药丸 */}
      {allKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allKeywords.map(kw => (
            <span key={kw} className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 text-xs font-mono">
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* 预算统计 */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">召回统计</span>
        <span className="font-mono text-slate-400">
          {totalMessages} 条消息 · {totalTokens} tokens
        </span>
      </div>

      {/* 每个关键词的召回组 */}
      <div className="space-y-2">
        {recallLog.map((entry) => (
          <div key={entry.keyword} className="rounded border border-slate-800/60 overflow-hidden">
            <button
              onClick={() => setExpandedKeyword(expandedKeyword === entry.keyword ? null : entry.keyword)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  entry.source === 'sqlite' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {entry.source === 'sqlite' ? '搜索' : '摘要'}
                </span>
                <span className="text-slate-300">{entry.keyword}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-500">{entry.results} 条</span>
                <span className={`text-slate-600 transition-transform duration-200 ${expandedKeyword === entry.keyword ? 'rotate-90' : ''}`}>▶</span>
              </div>
            </button>

            {expandedKeyword === entry.keyword && entry.messages && entry.messages.length > 0 && (
              <div className="border-t border-slate-800/40">
                {entry.messages.map((msg, idx) => {
                  const msgKey = `${entry.keyword}-${idx}`;
                  const isExpanded = expandedMsg === msgKey;
                  return (
                    <div key={msgKey} className="border-b border-slate-800/30 last:border-b-0">
                      <button
                        onClick={() => setExpandedMsg(isExpanded ? null : msgKey)}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800/20 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`px-1 py-0.5 rounded text-[10px] ${
                            msg.role === 'user' ? 'bg-slate-700 text-slate-300' : 'bg-indigo-500/10 text-indigo-400'
                          }`}>
                            {msg.role === 'user' ? '用户' : 'AI'}
                          </span>
                          <span className="text-slate-600 font-mono">{msg.session_id.slice(0, 8)}</span>
                          <span className="text-slate-700 text-[10px]">
                            {msg.created_at ? new Date(msg.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <p className={`text-xs text-slate-500 mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {msg.content}
                        </p>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {expandedKeyword === entry.keyword && (!entry.messages || entry.messages.length === 0) && (
              <div className="px-3 py-2 text-xs text-slate-600 border-t border-slate-800/40">
                {entry.source === 'sqlite' ? '该关键词无匹配结果' : '摘要回退模式'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type TabKey = 'token' | 'recall';

export default function DebugDrawer({ open, onClose, layers, totalTokens, contextSize, recallLog }: DebugDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('token');

  if (!open) return null;

  return (
    <div className="w-96 flex-shrink-0 flex flex-col bg-slate-950/95 border-l border-slate-800/40 animate-slide-in">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40">
        <span className="text-sm font-medium text-slate-300">调试面板</span>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* 标签栏 */}
      <div className="flex border-b border-slate-800/40">
        {([
          { key: 'token' as TabKey, label: 'Token 分析' },
          { key: 'recall' as TabKey, label: '记忆召回' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'text-teal-400 border-b-2 border-teal-400'
                : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 标签内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen">
        {activeTab === 'token' ? (
          <TokenTab layers={layers} totalTokens={totalTokens} contextSize={contextSize} />
        ) : (
          <RecallTab recallLog={recallLog} />
        )}
      </div>
    </div>
  );
}
