/**
 * DebugContent — 调试面板纯内容组件
 *
 * 包含三个标签页：Token 分析 / 记忆召回 / ReAct 追踪
 * 由 DebugDrawer 或 FloatingWindow 提供外层容器
 */
import { useState } from 'react';
import type { MemoryDebugLayer } from '../types/debug';
import type { RecallLogEntry, ReactTraceStep } from '../hooks/useDebugState';

interface DebugContentProps {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
  recallLog: RecallLogEntry[] | null;
  reactTrace: ReactTraceStep[];
}

/* ── 辅助函数 ── */

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

/* ── 标签页：Token 分析 ── */

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

/* ── 标签页：记忆召回 ── */

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
                {entry.source === 'knowledge' || entry.source === 'knowledge_placeholder' ? (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    entry.method === 'sparse'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : entry.method === 'fulltext'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-orange-500/10 text-orange-400'
                  }`}>
                    {entry.method === 'sparse' ? '稀疏向量' : entry.method === 'fulltext' ? '全文注入' : 'BM25'}
                  </span>
                ) : (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    entry.source === 'sqlite' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                  }`}>
                    {entry.source === 'sqlite' ? '搜索' : entry.source === 'hybrid' ? '混合检索' : entry.source === 'summary' ? '摘要' : entry.source === 'thinking_clusters' ? '思维簇' : '摘要'}
                  </span>
                )}
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
              <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-800/40 space-y-1">
                {entry.source === 'sqlite' ? (
                  <span className="text-slate-600">该关键词无匹配结果</span>
                ) : entry.source === 'knowledge' || entry.source === 'knowledge_placeholder' ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-600">稠密向量</span>
                      <span className="font-mono text-slate-400">{entry.vector_count ?? '?'} 条</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-600">{entry.method === 'sparse' ? '稀疏向量' : 'BM25'}</span>
                      <span className="font-mono text-slate-400">{entry.sparse_count ?? '?'} 条</span>
                    </div>
                    {(entry.graph_count ?? 0) > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-slate-600">图谱召回</span>
                        <span className="font-mono text-slate-400">{entry.graph_count} 条</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-slate-600">检索结果已注入 prompt</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 标签页：ReAct 追踪 ── */

function TraceTab({ trace }: { trace: ReactTraceStep[] }) {
  if (trace.length === 0) {
    return (
      <div className="p-4 text-center text-slate-600 text-sm">
        发送消息后显示 AI 的思考过程
      </div>
    );
  }

  // 按迭代分组
  const iterations = new Map<number, ReactTraceStep[]>();
  for (const step of trace) {
    const list = iterations.get(step.iteration) || [];
    list.push(step);
    iterations.set(step.iteration, list);
  }

  function actionLabel(action: string): string {
    const map: Record<string, string> = {
      thinking: '思考中',
      tool_call: '调用工具',
      tool_result: '工具结果',
      response: '最终回复',
      error: '错误',
      cancelled: '已取消',
    };
    return map[action] || action;
  }

  function actionColor(action: string): string {
    const map: Record<string, string> = {
      tool_call: 'bg-blue-500/10 text-blue-400',
      tool_result: 'bg-emerald-500/10 text-emerald-400',
      response: 'bg-teal-500/10 text-teal-400',
      error: 'bg-red-500/10 text-red-400',
      cancelled: 'bg-amber-500/10 text-amber-400',
    };
    return map[action] || 'bg-slate-500/10 text-slate-400';
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">ReAct 循环追踪</span>
        <span className="font-mono text-slate-400">{trace.length} 步</span>
      </div>

      {[...iterations.entries()].map(([iter, steps]) => (
        <div key={iter} className="space-y-1">
          <div className="text-[10px] text-slate-600 font-mono px-1">
            ── 第 {iter + 1} 轮 ──
          </div>
          {steps.map((step, idx) => (
            <div key={idx} className="rounded border border-slate-800/60 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${actionColor(step.action)}`}>
                    {actionLabel(step.action)}
                  </span>
                  {step.tool && (
                    <span className="font-mono text-slate-300">{step.tool}</span>
                  )}
                  {step.error && (
                    <span className="text-red-400 truncate max-w-40">{step.error}</span>
                  )}
                </div>
                {step.duration_ms != null && (
                  <span className={`font-mono ${step.duration_ms > 5000 ? 'text-red-400' : step.duration_ms > 1000 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {step.duration_ms >= 1000 ? `${(step.duration_ms / 1000).toFixed(1)}s` : `${Math.round(step.duration_ms)}ms`}
                  </span>
                )}
              </div>
              {step.thinking && (
                <div className="px-3 py-1.5 text-xs text-slate-500 bg-slate-950/50 border-t border-slate-800/40 italic truncate">
                  {step.thinking}
                </div>
              )}
              {step.action === 'tool_result' && step.success != null && (
                <div className="px-3 py-1 text-[10px] border-t border-slate-800/30">
                  <span className={step.success ? 'text-emerald-500' : 'text-red-400'}>
                    {step.success ? '成功' : '失败'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── 主组件 ── */

type TabKey = 'token' | 'recall' | 'trace';

export default function DebugContent({ layers, totalTokens, contextSize, recallLog, reactTrace }: DebugContentProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('token');

  return (
    <>
      {/* 标签栏 */}
      <div className="flex border-b border-slate-800/40">
        {([
          { key: 'token' as TabKey, label: 'Token 分析' },
          { key: 'recall' as TabKey, label: '记忆召回' },
          { key: 'trace' as TabKey, label: 'ReAct 追踪' },
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
        ) : activeTab === 'recall' ? (
          <RecallTab recallLog={recallLog} />
        ) : (
          <TraceTab trace={reactTrace} />
        )}
      </div>
    </>
  );
}
