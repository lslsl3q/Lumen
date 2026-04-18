/**
 * Memory Debug 面板 — 聊天内紧凑 Token 监控
 *
 * 职责：在聊天区域下方显示提示词分层 token 用量
 * 只在 memoryDebugMode 开启且存在 memoryDebugInfo 时可见
 * 默认折叠，展开后显示进度条 + 各层 token 数
 */
import { useState } from 'react';

/** 单层记忆调试信息 */
export interface MemoryDebugLayer {
  name: string;
  tokens: number;
  content: string;
}

/** 完整记忆调试数据 */
export interface MemoryDebugInfo {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
}

interface MemoryDebugPanelProps {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
  visible: boolean;
}

/** 根据占比返回进度条颜色 */
function getBarColor(percent: number): string {
  if (percent > 80) return 'bg-red-500';
  if (percent > 50) return 'bg-amber-500';
  return 'bg-teal-500';
}

/** 根据 token 数返回文字颜色 */
function getTokenTextColor(tokens: number): string {
  if (tokens > 500) return 'text-orange-400';
  if (tokens >= 100) return 'text-amber-400';
  return 'text-emerald-400';
}

function MemoryDebugPanel({ layers, totalTokens, contextSize, visible }: MemoryDebugPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!visible || layers.length === 0) return null;

  const percent = contextSize > 0 ? Math.round((totalTokens / contextSize) * 100) : 0;

  return (
    <div className="mx-6 mb-2">
      <div
        className="
          rounded-lg border border-slate-800/60 bg-slate-900/80
          overflow-hidden transition-all duration-200
        "
      >
        {/* 标题栏（点击折叠/展开） */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="
            w-full flex items-center justify-between px-3 py-2
            text-xs text-slate-400 hover:text-slate-300
            transition-colors duration-150 cursor-pointer
          "
        >
          <span className="font-mono">
            Token 监控 ({totalTokens} / {contextSize} = {percent}%)
          </span>
          <span className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </button>

        {/* 展开内容 */}
        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            {/* 进度条 */}
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getBarColor(percent)}`}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>

            {/* 各层 token 分布 */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {layers.map((layer) => (
                <span key={layer.name} className="text-xs">
                  <span className="text-slate-500">{layer.name}</span>{' '}
                  <span className={`font-mono ${getTokenTextColor(layer.tokens)}`}>
                    {layer.tokens}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryDebugPanel;
