/**
 * TitleBar — 自定义标题栏（面包屑导航）
 *
 * 三段式：左侧品牌+面包屑 | 中间拖拽区 | 右侧功能+窗口控制
 * 不在 Dashboard 时显示（Dashboard 有自己的顶栏）
 */
import { useState, useEffect, useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useModeStore } from '../stores/useModeStore';
import { useWritingStore } from '../stores/useWritingStore';
import { useTheme } from '../lib/theme/context';
import type { AppMode } from '../stores/useModeStore';

const MODE_LABELS: Record<AppMode, string> = {
  dashboard: '',
  chat: '聊天',
  base: '暗影之城',
  rpg: '暗影之城',
  writing: '',
};

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function RestoreIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
      <rect x="4" y="1" width="11" height="11" rx="1" strokeWidth="1.2" />
      <rect x="1" y="4" width="11" height="11" rx="1" strokeWidth="1.2" strokeOpacity="0.5" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
      <rect x="2" y="2" width="12" height="12" rx="1" strokeWidth="1.2" />
    </svg>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-text-dim">/</span>}
          <button
            onClick={item.onClick}
            className={`truncate max-w-[200px] ${item.onClick
              ? 'text-text-muted hover:text-text-secondary transition-colors duration-150 cursor-pointer'
              : 'text-text-secondary'
            }`}
          >
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

function TitleBar() {
  const appWindow = useMemo(() => isTauri ? getCurrentWindow() : null, []);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const { activeMode, switchMode } = useModeStore();
  const { theme, themes, setTheme, isDark } = useTheme();

  // Writing mode context — direct selectors for proper reactivity
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const projects = useWritingStore((s) => s.projects);
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const chapters = useWritingStore((s) => s.chapters);
  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  useEffect(() => {
    if (!appWindow) return;
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});

    const unlisten = appWindow.onResized(async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch { /* window may be closed */ }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [appWindow]);

  const handleMinimize = () => appWindow?.minimize();
  const handleMaximize = () => appWindow?.toggleMaximize();
  const handleClose = () => appWindow?.close();
  const handleSettings = () => window.dispatchEvent(new CustomEvent('lumen:open-settings'));
  const handlePin = async () => {
    if (!appWindow) return;
    const next = !isPinned;
    await appWindow.setAlwaysOnTop(next);
    setIsPinned(next);
  };

  // Build breadcrumb items
  const breadcrumbItems = useMemo(() => {
    const items: { label: string; onClick?: () => void }[] = [];

    if (activeMode === 'writing' && activeProject) {
      items.push({ label: activeProject.name });
      if (activeChapter) {
        items.push({ label: activeChapter.title });
      }
    } else {
      const label = MODE_LABELS[activeMode];
      if (label) items.push({ label });
    }

    return items;
  }, [activeMode, activeProject, activeChapter]);

  return (
    <div className="h-9 flex items-center bg-surface-rail/80 border-b border-border-default select-none relative">
      {/* 左侧：Logo + 面包屑 */}
      <div className="flex items-center gap-2 pl-4 h-full shrink-0">
        <button
          onClick={() => switchMode('dashboard')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity duration-150 cursor-pointer"
          title="回到大堂"
        >
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(204,124,94,0.6)]" />
        </button>
        {breadcrumbItems.length > 0 && <Breadcrumb items={breadcrumbItems} />}
      </div>

      {/* 中间填充 — 拖拽区 */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* 右侧窗口控制 */}
      <div className="flex items-center h-full">
        {/* 置顶 */}
        <button
          onClick={handlePin}
          className="h-full flex items-center justify-center px-1 cursor-pointer"
          title={isPinned ? '取消置顶' : '窗口置顶'}
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md
            hover:bg-slate-700/40 transition-all duration-200">
            <svg
              className={`w-3 h-3 text-text-muted transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isPinned ? 'rotate-45' : 'rotate-0'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2V5zM7 9v3a5 5 0 005 5v0a5 5 0 005-5V9" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 17v4" />
            </svg>
          </span>
        </button>
        {/* 主题切换 */}
        <button
          onClick={() => {
            const next = themes.find(t => t.id !== theme.id);
            if (next) setTheme(next.id);
          }}
          className="h-full flex items-center justify-center px-1 cursor-pointer"
          title={isDark ? '切换到浅色' : '切换到暗色'}
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md
            hover:bg-slate-700/40 transition-all duration-200">
            {isDark ? (
              <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </span>
        </button>
        {/* 设置 */}
        <button
          onClick={handleSettings}
          className="h-full flex items-center justify-center px-1 cursor-pointer"
          title="设置"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md
            hover:bg-slate-700/40 transition-all duration-150">
            <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
        </button>

        {/* 分隔 */}
        <div className="w-px h-4 bg-slate-700/40 mx-1" />

        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center
            text-text-muted hover:text-text-primary hover:bg-surface-elevated
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
            text-text-muted hover:text-text-primary hover:bg-surface-elevated
            active:soft-pressed transition-all duration-150 cursor-pointer"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center
            text-text-muted hover:text-red-400 hover:bg-red-500/10
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
