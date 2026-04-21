/**
 * 侧边栏 Author's Note 面板
 * 每会话独立的临时提示词注入
 */
import { useState } from 'react';
import type { AuthorsNoteConfig } from '../types/authorNote';

interface AuthorNotePanelProps {
  config: AuthorsNoteConfig | null;
  isLoading: boolean;
  onSaveContent: (content: string) => void;
  onSetPosition: (position: 'before_user' | 'after_user') => void;
}

function AuthorNotePanel({
  config,
  isLoading,
  onSaveContent,
  onSetPosition,
}: AuthorNotePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 加载中 → 显示占位
  if (isLoading) {
    return (
      <div className="border-t border-slate-800/40 px-4 py-2.5 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <span className="text-sm text-slate-500">Author's Note</span>
      </div>
    );
  }

  // 统一渲染逻辑（无论有无配置）
  return (
    <div className="border-t border-slate-800/40">
      {/* 标题行：始终显示 */}
      <div className="flex items-center px-4 py-2.5 gap-3">
        {/* 图标 */}
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>

        {/* 标题 */}
        <span className="text-sm text-slate-300 flex-1">Author's Note</span>

        {/* 三角箭头：只控制展开/收起 */}
        <button onClick={() => setIsExpanded(!isExpanded)}>
          <svg
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 展开区：有配置或无配置都显示输入框 */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* 文本输入框 */}
          <textarea
            defaultValue={config?.content || ''}
            onChange={(e) => onSaveContent(e.target.value)}
            placeholder="输入临时提示词..."
            rows={3}
            className="
              w-full bg-slate-900/60 border border-slate-700/60 rounded-lg
              px-3 py-2 text-sm text-slate-300 placeholder-slate-600
              focus:outline-none focus:border-amber-500/50 resize-none
            "
          />

          {/* 位置选择器（仅在有配置时显示） */}
          {config && (
            <div className="flex gap-2">
              <button
                onClick={() => onSetPosition('before_user')}
                className={`
                  flex-1 px-2 py-1.5 text-xs rounded-md transition-colors
                  ${config.injection_position === 'before_user'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800/60 text-slate-400 border border-slate-700/60 hover:border-slate-600'
                  }
                `}
              >
                用户消息前
              </button>
              <button
                onClick={() => onSetPosition('after_user')}
                className={`
                  flex-1 px-2 py-1.5 text-xs rounded-md transition-colors
                  ${config.injection_position === 'after_user'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800/60 text-slate-400 border border-slate-700/60 hover:border-slate-600'
                  }
                `}
              >
                用户消息后
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AuthorNotePanel;