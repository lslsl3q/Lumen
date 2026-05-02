/**
 * DebugWindowPage — 调试窗口独立页面
 *
 * 极简自定义标题栏 + DebugContent
 */
import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emit } from '@tauri-apps/api/event';
import DebugContent from '../components/DebugContent';
import type { MemoryDebugLayer } from '../types/debug';
import type { RecallLogEntry, ReactTraceStep } from '../hooks/useDebugState';

/** localStorage 持久化 key */
const STORAGE_KEY = 'lumen_memory_debug';

interface DebugPayload {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
  recallLog: RecallLogEntry[] | null;
  reactTrace: ReactTraceStep[];
}

/** 从 localStorage 读取缓存数据 */
function loadCached(): DebugPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/** 将数据写入 localStorage */
function saveCache(data: DebugPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export default function DebugWindowPage() {
  const [data, setData] = useState<DebugPayload>(() => {
    const cached = loadCached();
    if (cached) {
      return {
        layers: cached.layers ?? [],
        totalTokens: cached.totalTokens ?? 0,
        contextSize: cached.contextSize ?? 4096,
        recallLog: cached.recallLog ?? null,
        reactTrace: cached.reactTrace ?? [],
      };
    }
    return {
      layers: [],
      totalTokens: 0,
      contextSize: 4096,
      recallLog: null,
      reactTrace: [],
    };
  });
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const win = getCurrentWindow();

  // 监听主窗口推送的 debug 数据，同时持久化
  useEffect(() => {
    const unlisten = listen<DebugPayload>('debug-data', (event) => {
      setData(event.payload);
      saveCache(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // 监听最大化状态变化
  useEffect(() => {
    const unlisten = win.onResized(async () => {
      setMaximized(await win.isMaximized());
    });
    return () => { unlisten.then(fn => fn()); };
  }, [win]);

  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop;
    await win.setAlwaysOnTop(next);
    setAlwaysOnTop(next);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 select-none">
      {/* 自定义标题栏 */}
      <div className="flex items-center h-8 shrink-0" data-tauri-drag-region>
        {/* 左：标题 */}
        <div className="flex items-center gap-1.5 pl-3" data-tauri-drag-region>
          <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">
            Debug Monitor
          </span>
        </div>

        {/* 中：弹性拖拽区 */}
        <div className="flex-1" data-tauri-drag-region />

        {/* 右：置顶 + 窗口控制 */}
        <div className="flex items-center">
          {/* 置顶 */}
          <button
            onClick={toggleAlwaysOnTop}
            className={`h-8 px-2 flex items-center justify-center text-[10px] transition-colors cursor-pointer
              ${alwaysOnTop
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-slate-600 hover:text-slate-400 hover:bg-slate-800/40'
              }`}
            title={alwaysOnTop ? '取消置顶' : '始终置顶'}
          >
            置顶
          </button>

          {/* 最小化 */}
          <button
            onClick={() => win.minimize()}
            className="h-8 w-10 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <svg className="w-3.5" viewBox="0 0 12 12"><rect y="5" width="12" height="1.2" fill="currentColor" /></svg>
          </button>

          {/* 最大化/还原 */}
          <button
            onClick={() => win.toggleMaximize()}
            className="h-8 w-10 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            {maximized ? (
              <svg className="w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="2.5" y="3.5" width="6" height="6" rx="0.5" />
                <path d="M4 3.5V2h6v6h-1.5" />
              </svg>
            ) : (
              <svg className="w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="1.5" y="2.5" width="8" height="7" rx="0.5" />
              </svg>
            )}
          </button>

          {/* 关闭：先通知主窗口，再销毁 */}
          <button
            onClick={async () => {
              await emit('debug-closed');
              await win.destroy();
            }}
            className="h-8 w-10 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-tr-sm"
          >
            <svg className="w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* 调试内容 */}
      <div className="flex-1 overflow-hidden">
        {data.layers.length === 0 && data.reactTrace.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="text-xs text-slate-600">等待调试数据...</div>
              <div className="text-[10px] text-slate-700">发送消息后自动显示</div>
            </div>
          </div>
        ) : (
          <DebugContent
            layers={data.layers}
            totalTokens={data.totalTokens}
            contextSize={data.contextSize}
            recallLog={data.recallLog}
            reactTrace={data.reactTrace}
          />
        )}
      </div>
    </div>
  );
}
