/**
 * Token Inspector 页面 — 独立完整版
 *
 * 职责：展示提示词分层 token 用量 + 每层可展开查看完整内容
 * 路由：/settings/token-inspector
 * 数据来源：localStorage（由 ChatInterface 写入最近一次 memoryDebugInfo）
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MemoryDebugLayer } from '../components/PromptDebugPanel';
import type { SettingsPageProps } from '../types/settings';

/** localStorage 中存储 memoryDebugInfo 的 key */
export const MEMORY_DEBUG_STORAGE_KEY = 'lumen_memory_debug';

/** localStorage 中存储 memoryDebugInfo 的格式 */
export interface StoredMemoryDebugInfo {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
  timestamp: number;
}

/** 根据 token 数返回文字颜色 */
function getTokenTextColor(tokens: number): string {
  if (tokens > 500) return 'text-orange-400';
  if (tokens >= 100) return 'text-amber-400';
  return 'text-emerald-400';
}

/** 根据占比返回进度条颜色 */
function getBarColor(percent: number): string {
  if (percent > 80) return 'bg-red-500';
  if (percent > 50) return 'bg-amber-500';
  return 'bg-teal-500';
}

/** 单层折叠行 */
function LayerRow({ layer }: { layer: MemoryDebugLayer }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-slate-800/40 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="
          w-full flex items-center justify-between px-4 py-3
          text-sm text-slate-300 hover:text-slate-100
          hover:bg-slate-800/30 transition-colors duration-150 cursor-pointer
        "
      >
        <span>{layer.name}</span>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-xs ${getTokenTextColor(layer.tokens)}`}>
            {layer.tokens} tokens
          </span>
          <span className={`text-xs text-slate-600 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </div>
      </button>
      {expanded && layer.content && (
        <div className="px-4 pb-3">
          <pre className="
            text-xs font-mono text-slate-400
            bg-black/30 rounded-lg p-3
            overflow-x-auto whitespace-pre-wrap break-words
            max-h-64 overflow-y-auto
          ">
            {layer.content}
          </pre>
        </div>
      )}
    </div>
  );
}

interface TokenInspectorProps extends SettingsPageProps {}

function TokenInspector({ onBack }: TokenInspectorProps) {
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate(-1));
  const [memoryDebugInfo, setMemoryDebugInfo] = useState<StoredMemoryDebugInfo | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEMORY_DEBUG_STORAGE_KEY);
      if (raw) {
        setMemoryDebugInfo(JSON.parse(raw));
      }
    } catch {
      // 解析失败就忽略
    }
  }, []);

  // 记忆配置信息（只读展示，实际修改在角色编辑器）
  const memoryConfig = (
    <div className="rounded-xl border border-slate-800/40 bg-slate-900/60 p-5">
      <h3 className="text-base text-slate-200 mb-4">跨会话记忆配置</h3>
      <div className="space-y-2 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Token 上限:</span>
          <span className="text-slate-300 font-mono">300</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">超预算处理:</span>
          <span className="text-slate-300">截断</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">状态:</span>
          <span className="text-emerald-400">已开启</span>
        </div>
        <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-800/40">
          实际修改在角色编辑器中
        </p>
      </div>
    </div>
  );

  return (
    <div className="h-full bg-surface-deep text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={goBack}
            className="
              px-3 py-1.5 rounded-lg text-sm text-slate-400
              hover:text-slate-200 hover:bg-slate-800/60
              transition-all duration-150
            "
          >
            &larr; 返回
          </button>
          <h1 className="text-xl font-light tracking-wide">Token Inspector</h1>
        </div>

        {!memoryDebugInfo ? (
          /* 无数据提示 */
          <div className="rounded-xl border border-slate-800/40 bg-slate-900/60 p-8 text-center">
            <p className="text-slate-500 text-sm">
              发送一条消息后查看提示词结构
            </p>
            <p className="text-slate-600 text-xs mt-2">
              需要在聊天中开启 memory debug 模式（/medebug 命令）
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 提示词结构 */}
            <div>
              <h2 className="text-sm text-slate-500 mb-3">
                提示词结构 (最后一次对话)
              </h2>
              <div className="rounded-xl border border-slate-800/40 bg-slate-900/60 overflow-hidden">
                {/* 各层列表 */}
                {memoryDebugInfo.layers.map((layer) => (
                  <LayerRow key={layer.name} layer={layer} />
                ))}

                {/* 合计行 */}
                <div className="px-4 py-3 bg-slate-800/20 border-t border-slate-800/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-300 font-medium">合计</span>
                    <span className="font-mono text-sm text-slate-300">
                      {memoryDebugInfo.totalTokens} / {memoryDebugInfo.contextSize}{' '}
                      <span className="text-slate-500">
                        ({Math.round((memoryDebugInfo.totalTokens / memoryDebugInfo.contextSize) * 100)}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getBarColor(
                        (memoryDebugInfo.totalTokens / memoryDebugInfo.contextSize) * 100
                      )}`}
                      style={{
                        width: `${Math.min(
                          (memoryDebugInfo.totalTokens / memoryDebugInfo.contextSize) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 跨会话记忆配置 */}
            {memoryConfig}
          </div>
        )}
      </div>
    </div>
  );
}

export default TokenInspector;
