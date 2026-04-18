/**
 * 侧边栏世界书面板
 *
 * 职责：显示世界书启用状态，提供管理入口
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
    <div className="relative border-t border-slate-800/40">
      <button
        onClick={onManageClick}
        className="
          w-full px-4 py-2.5 flex items-center gap-3
          hover:bg-slate-800/40 transition-all duration-150
        "
      >
        {/* 图标 */}
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        {/* 信息 */}
        <div className="flex-1 text-left">
          <div className="text-xs text-slate-500">世界书</div>
          <div className="text-sm text-slate-300 truncate">
            {isLoading ? '加载中...' : `${enabledCount}/${totalCount} 条启用`}
          </div>
        </div>
        {/* 设置图标 */}
        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  );
}

export default WorldBookPanel;
