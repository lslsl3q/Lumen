/**
 * ActivityBar — VS Code 风格活动图标条
 *
 * 左侧 w-12 窄条：面板图标（点击打开/切换面板）+ 动作图标（点击触发事件）+ ⋯更多
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import Popover from './Popover';

export type PanelId = 'sessions' | 'character' | 'persona';

interface ActivityBarProps {
  activePanelId: PanelId | null;
  onPanelSelect: (id: PanelId) => void;
  onOpenMemoryWindow: () => void;
  onOpenGraphEditor: () => void;
  onManageWorldBooks: () => void;
  onToggleDebug: () => void;
  onOpenSettings: () => void;
}

/** 面板图标配置 */
const PANEL_ICONS: { id: PanelId; title: string }[] = [
  { id: 'sessions', title: '会话' },
  { id: 'character', title: '角色' },
  { id: 'persona', title: '身份' },
];

/** 统一图标按钮容器 */
const iconSlot = `w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer
  transition-colors duration-150 relative`;

/** 活跃态左侧 accent bar */
function ActiveIndicator() {
  return (
    <div className="absolute left-0 top-1/4 bottom-1/4 w-[2px] rounded-r bg-amber-400" />
  );
}

/** 会话图标 */
function SessionsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  );
}

/** 角色图标 */
function CharacterIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

/** 身份图标 */
function PersonaIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

/** 图谱图标 */
function GraphIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="5" cy="5" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="19" cy="5" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="19" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
      <circle cx="19" cy="19" r="1.5" />
      <line x1="6.5" y1="5" x2="10.5" y2="5" strokeWidth="1" />
      <line x1="13.5" y1="5" x2="17.5" y2="5" strokeWidth="1" />
      <line x1="5" y1="6.5" x2="5" y2="10.5" strokeWidth="1" />
      <line x1="5" y1="13.5" x2="5" y2="17.5" strokeWidth="1" />
      <line x1="6.5" y1="12" x2="10.5" y2="12" strokeWidth="1" />
      <line x1="12" y1="6.5" x2="12" y2="10.5" strokeWidth="1" />
    </svg>
  );
}

/** 世界书图标 */
function WorldBookIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

/** 监控图标 */
function DebugIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function getPanelIcon(id: PanelId) {
  switch (id) {
    case 'sessions': return <SessionsIcon />;
    case 'character': return <CharacterIcon />;
    case 'persona': return <PersonaIcon />;
  }
}

function ActivityBar({
  activePanelId,
  onPanelSelect,
  onOpenMemoryWindow,
  onOpenGraphEditor,
  onManageWorldBooks,
  onToggleDebug,
  onOpenSettings,
}: ActivityBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const moreMenuContent = (
    <div className="py-1.5">
      <button
        onClick={() => { onOpenSettings(); setMoreOpen(false); }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer
          text-slate-400 hover:text-slate-200 hover:bg-[#2a2926]
          transition-colors duration-100 text-xs"
      >
        设置...
      </button>
    </div>
  );

  return (
    <div className="w-12 flex flex-col items-center bg-slate-950 border-r border-slate-800/30
      select-none py-2 flex-shrink-0"
    >
      {/* 面板图标 */}
      <div className="flex flex-col items-center gap-0.5">
        {PANEL_ICONS.map(({ id, title }) => {
          const isActive = activePanelId === id;
          return (
            <button
              key={id}
              onClick={() => onPanelSelect(id)}
              className={`${iconSlot}
                ${isActive
                  ? 'text-amber-400 bg-amber-500/10'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40 focus-visible:bg-slate-800/40`}
              title={title}
            >
              {isActive && <ActiveIndicator />}
              {getPanelIcon(id)}
            </button>
          );
        })}
      </div>

      {/* 分隔线 */}
      <div className="h-px w-6 bg-slate-800/40 my-2" />

      {/* 动作图标 */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={onOpenMemoryWindow}
          className={`${iconSlot} text-slate-500 hover:text-slate-300 hover:bg-slate-800/40
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40 focus-visible:bg-slate-800/40`}
          title="知识运维"
        >
          <Database className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenGraphEditor}
          className={`${iconSlot} text-slate-500 hover:text-slate-300 hover:bg-slate-800/40
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40 focus-visible:bg-slate-800/40`}
          title="图谱编辑器"
        >
          <GraphIcon />
        </button>
        <button
          onClick={onManageWorldBooks}
          className={`${iconSlot} text-slate-500 hover:text-slate-300 hover:bg-slate-800/40
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40 focus-visible:bg-slate-800/40`}
          title="世界书"
        >
          <WorldBookIcon />
        </button>
        <button
          onClick={onToggleDebug}
          className={`${iconSlot} text-slate-500 hover:text-slate-300 hover:bg-slate-800/40
            focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40 focus-visible:bg-slate-800/40`}
          title="监控面板"
        >
          <DebugIcon />
        </button>
      </div>

      {/* 弹性填充 */}
      <div className="flex-1" />

      {/* 底部 ⋯ 更多 */}
      <div className="flex flex-col items-center gap-0.5 pt-2 border-t border-slate-800/40 w-full">
        <Popover
          trigger={
            <button
              className={`${iconSlot} text-slate-600 hover:text-slate-400 hover:bg-slate-800/40
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40 focus-visible:bg-slate-800/40`}
              title="更多"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </button>
          }
          content={moreMenuContent}
          open={moreOpen}
          onOpenChange={setMoreOpen}
          placement="top-start"
          className="w-40"
        />
      </div>
    </div>
  );
}

export default ActivityBar;
