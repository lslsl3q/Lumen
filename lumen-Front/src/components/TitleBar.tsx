/**
 * TitleBar — 自定义标题栏
 *
 * 三段式：左侧品牌 | 中间模式切换 | 右侧窗口控制
 * data-tauri-drag-region 只应用在空白区域，按钮不在 drag region 内
 */
import { useState, useEffect, useMemo } from 'react';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';
import ModeSwitch from './ModeSwitch';

const MODES = [
  { key: 'chat', label: 'Chat', available: true },
  { key: 'workbench', label: 'Workbench', available: false },
];

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 还原图标：两个重叠方块 */
function RestoreIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
      <rect x="4" y="1" width="11" height="11" rx="1" strokeWidth="1.2" />
      <rect x="1" y="4" width="11" height="11" rx="1" strokeWidth="1.2"
        strokeOpacity="0.5" />
    </svg>
  );
}

/** 最大化图标：单方块+展开角标 */
function MaximizeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
      <rect x="2" y="2" width="12" height="12" rx="1" strokeWidth="1.2" />
    </svg>
  );
}

function TitleBar() {
  const appWindow = useMemo(() => isTauri ? getCurrentWindow() : null, []);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMode, setActiveMode] = useState('chat');

  useEffect(() => {
    if (!appWindow) return;
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});

    const unlisten = appWindow.onResized(async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch { /* 窗口可能已关闭 */ }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [appWindow]);

  const handleMinimize = () => appWindow?.minimize();
  const handleMaximize = () => appWindow?.toggleMaximize();
  const handleClose = () => appWindow?.close();
  const handleSettings = () => window.dispatchEvent(new CustomEvent('lumen:open-settings'));

  return (
    <div className="h-9 flex items-center bg-slate-950/80 border-b border-slate-800/40 select-none">
      {/* 左侧品牌 — 拖拽区 */}
      <div data-tauri-drag-region className="flex items-center gap-2 pl-4 h-full cursor-default">
        <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(204,124,94,0.6)]" />
        <span className="text-sm font-light tracking-widest text-slate-400 uppercase font-display">
          Lumen
        </span>
      </div>

      {/* 左侧填充 — 拖拽区 */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* 中间模式切换 — 不带 drag region，按钮可点击 */}
      <ModeSwitch
        modes={MODES}
        activeMode={activeMode}
        onSwitch={setActiveMode}
      />

      {/* 右侧填充 — 拖拽区 */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* 右侧窗口控制 — 不带 drag region */}
      <div className="flex items-center h-full">
        {/* 设置 */}
        <button
          onClick={handleSettings}
          className="w-11 h-full flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
            active:soft-pressed transition-all duration-150 cursor-pointer"
          title="设置"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
            active:soft-pressed transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14" />
          </svg>
        </button>

        {/* 最大化/还原 */}
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
            active:soft-pressed transition-all duration-150 cursor-pointer"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
            active:soft-pressed transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
