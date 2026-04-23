/**
 * 右侧图标栏（RightRail）
 *
 * 薄型垂直图标条，贴在右侧边缘
 * 图标触发面板从右侧展开（触发器和面板在同一侧）
 */
interface RightRailProps {
  onToggleDebug: () => void;
  isDebugOpen: boolean;
  onManageWorldBooks: () => void;
}

function RightRail({ onToggleDebug, isDebugOpen, onManageWorldBooks }: RightRailProps) {
  const iconBase = `w-7 h-7 rounded-lg flex items-center justify-center
    transition-all duration-150
    focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-amber-500/40`;

  return (
    <div className="w-10 flex-shrink-0 flex flex-col items-center py-3 gap-2
      bg-slate-950/60 border-l border-slate-800/30 relative z-50">
      {/* 世界书 */}
      <button
        onClick={onManageWorldBooks}
        className={`${iconBase}
          text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
          active:bg-slate-800/40`}
        title="世界书"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
      </button>
      {/* 监控/调试 */}
      <button
        onClick={onToggleDebug}
        className={`${iconBase}
          ${isDebugOpen
            ? 'text-amber-400 bg-amber-500/10'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
          }
          active:bg-slate-800/40`}
        title="监控面板"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
      </button>
    </div>
  );
}

export default RightRail;
