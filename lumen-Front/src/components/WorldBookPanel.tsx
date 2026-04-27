/**
 * 世界书面板 — ContextPanel 内使用
 *
 * 职责：显示世界书启用状态，提供管理入口
 * 面板内上下文：不再用 border-t 分隔
 */
import { useState, useEffect } from 'react';
import * as api from '../api/worldbook';

interface WorldBookPanelProps {
  onManageClick: () => void;
}

function WorldBookPanel({ onManageClick }: WorldBookPanelProps) {
  const [enabledCount, setEnabledCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listWorldBooks();
        setEnabledCount(list.filter(e => e.enabled).length);
        setTotalCount(list.length);
      } catch {
        // 静默失败
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-3 space-y-3">
      {/* 状态摘要 */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/20">
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex-shrink-0 flex items-center justify-center">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-600">世界书</div>
          <div className="text-sm text-slate-300">
            {isLoading ? '加载中...' : `${enabledCount}/${totalCount} 条启用`}
          </div>
        </div>
        {!isLoading && totalCount > 0 && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full
            ${enabledCount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800/60 text-slate-500'}`}>
            {enabledCount > 0 ? '活跃' : '未启用'}
          </span>
        )}
      </div>

      {/* 管理入口 */}
      <button
        onClick={onManageClick}
        className="w-full px-3 py-2.5 rounded-lg text-left text-sm text-slate-400
          hover:bg-slate-800/40 hover:text-slate-200
          transition-all duration-150 cursor-pointer flex items-center gap-2"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
        管理世界书...
      </button>
    </div>
  );
}

export default WorldBookPanel;
