/**
 * Author's Note 面板 — ContextPanel 内使用
 *
 * 每会话独立的临时提示词注入。
 * 可展开编辑，默认折叠。
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
  const [isExpanded, setIsExpanded] = useState(!!config?.content);

  if (isLoading) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
            </svg>
          </div>
          <span className="text-sm text-text-muted">加载中...</span>
        </div>
      </div>
    );
  }

  const hasContent = config?.content && config.content.trim().length > 0;

  return (
    <div className="p-3 space-y-2">
      {/* 标题行 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
          hover:bg-primary-subtle transition-all duration-150 cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
          </svg>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[10px] text-text-muted">Author's Note</div>
          <div className="text-sm text-text-primary truncate">
            {hasContent ? config.content.slice(0, 30) + (config.content.length > 30 ? '...' : '') : '点击编辑'}
          </div>
        </div>
        {hasContent && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
        )}
        <svg
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 编辑区 */}
      {isExpanded && (
        <div className="px-3 space-y-2">
          <textarea
            defaultValue={config?.content || ''}
            onChange={(e) => onSaveContent(e.target.value)}
            placeholder="输入临时提示词..."
            rows={4}
            className="w-full bg-surface-elevated border border-border-subtle rounded-lg
              px-3 py-2 text-sm text-text-primary placeholder-slate-600 leading-relaxed
              focus:outline-hidden focus:border-primary/40
              focus:shadow-[0_0_8px_rgba(204,124,94,0.08)]
              resize-none transition-all duration-200"
          />
          {config && (
            <div className="flex gap-2">
              <button
                onClick={() => onSetPosition('before_user')}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-all duration-150 cursor-pointer
                  ${config.injection_position === 'before_user'
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-border-subtle text-text-muted border border-border-subtle hover:border-border-default'
                  }`}
              >
                用户消息前
              </button>
              <button
                onClick={() => onSetPosition('after_user')}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-all duration-150 cursor-pointer
                  ${config.injection_position === 'after_user'
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-border-subtle text-text-muted border border-border-subtle hover:border-border-default'
                  }`}
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
