/**
 * 侧边栏 Author's Note 面板
 * 每会话独立的临时提示词注入
 */
import { useState } from 'react';
import type { AuthorsNoteConfig } from '../types/authorNote';

interface AuthorNotePanelProps {
  config: AuthorsNoteConfig | null;
  isLoading: boolean;
  onToggle: (enabled: boolean) => void;
  onSaveContent: (content: string) => void;
  onSetPosition: (position: 'before_user' | 'after_user') => void;
  onRemove: () => void;
  onCreate: () => void;
}

function AuthorNotePanel({
  config,
  isLoading,
  onToggle,
  onSaveContent,
  onSetPosition,
  onRemove,
  onCreate,
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

  // 无 note → 显示"点击添加"
  if (!config) {
    return (
      <div className="border-t border-slate-800/40">
        <button
          onClick={onCreate}
          className="
            w-full px-4 py-2.5 flex items-center gap-3
            hover:bg-slate-800/40 transition-all duration-150
          "
        >
          <div className="w-7 h-7 rounded-full bg-amber-500/20 flex-shrink-0 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <span className="text-sm text-slate-500">Author's Note</span>
          <span className="text-xs text-slate-600 ml-auto">点击添加</span>
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800/40">
      {/* 标题行：开关 + 展开 */}
      <div className="flex items-center px-4 py-2 gap-3">
        {/* 图标 */}
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>

        {/* 标题 */}
        <span className="text-sm text-slate-300 flex-1">Author's Note</span>

        {/* 开关 */}
        <button
          onClick={() => onToggle(!config!.enabled)}
          className={`
            w-9 h-5 rounded-full transition-colors duration-200 relative
            ${config!.enabled ? 'bg-amber-500' : 'bg-slate-700'}
          `}
        >
          <div className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${config!.enabled ? 'translate-x-4' : 'translate-x-0.5'}
          `} />
        </button>

        {/* 展开箭头 */}
        <button onClick={() => setIsExpanded(!isExpanded)}>
          <svg
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 展开区：仅 enabled 时显示编辑区 */}
      {isExpanded && config!.enabled && (
        <div className="px-4 pb-3 space-y-2">
          {/* 文本输入 */}
          <textarea
            defaultValue={config!.content}
            onChange={(e) => onSaveContent(e.target.value)}
            placeholder="输入临时提示词..."
            rows={3}
            className="
              w-full bg-slate-900/60 border border-slate-700/60 rounded-lg
              px-3 py-2 text-sm text-slate-300 placeholder-slate-600
              focus:outline-none focus:border-amber-500/50 resize-none
            "
          />

          {/* 位置选择器 */}
          <div className="flex gap-2">
            <button
              onClick={() => onSetPosition('before_user')}
              className={`
                flex-1 px-2 py-1.5 text-xs rounded-md transition-colors
                ${config!.injection_position === 'before_user'
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
                ${config!.injection_position === 'after_user'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/60 hover:border-slate-600'
                }
              `}
            >
              用户消息后
            </button>
          </div>

          {/* 删除按钮 */}
          <button
            onClick={onRemove}
            className="text-xs text-slate-600 hover:text-red-400 transition-colors"
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}

export default AuthorNotePanel;
