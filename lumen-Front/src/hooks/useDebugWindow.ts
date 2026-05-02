/**
 * useDebugWindow — Tauri 调试窗口生命周期 + 数据桥接
 *
 * 管理独立原生调试窗口：创建/销毁/数据同步
 */
import { useEffect, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import type { MemoryDebugData, ReactTraceStep } from './useDebugState';

const DEBUG_LABEL = 'debug';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface UseDebugWindowOptions {
  debugInfo: MemoryDebugData | null;
  reactTrace: ReactTraceStep[];
  isOpen: boolean;
  onClose: () => void;
}

export function useDebugWindow({ debugInfo, reactTrace, isOpen, onClose }: UseDebugWindowOptions) {
  const winRef = useRef<WebviewWindow | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** 同步 debug 数据到调试窗口 */
  useEffect(() => {
    if (!isOpen || !isTauri()) return;

    (async () => {
      const win = winRef.current || await WebviewWindow.getByLabel(DEBUG_LABEL);
      if (!win) return;

      emitTo(DEBUG_LABEL, 'debug-data', {
        layers: debugInfo?.layers || [],
        totalTokens: debugInfo?.total_tokens || 0,
        contextSize: debugInfo?.context_size || 4096,
        recallLog: debugInfo?.recall_log || null,
        reactTrace: reactTrace,
      }).catch(() => {});
    })();
  }, [debugInfo, reactTrace, isOpen]);

  /** isOpen 变为 true 时创建窗口 */
  useEffect(() => {
    if (!isOpen || !isTauri()) return;

    let cancelled = false;

    (async () => {
      // 检查是否已存在
      const existing = await WebviewWindow.getByLabel(DEBUG_LABEL);
      if (existing) {
        winRef.current = existing;
        try { await existing.setFocus(); } catch {}
        return;
      }

      if (cancelled) return;

      const baseUrl = window.location.origin;
      const debugUrl = baseUrl ? `${baseUrl}/#/debug` : '#/debug';

      const debugWin = new WebviewWindow(DEBUG_LABEL, {
        url: debugUrl,
        title: 'Lumen Debug Monitor',
        width: 620,
        height: 640,
        resizable: true,
        decorations: false,
        center: false,
        x: Math.max(100, window.screenX + window.outerWidth - 660),
        y: Math.max(60, window.screenY + 60),
      });

      winRef.current = debugWin;

      debugWin.once('tauri://created', async () => {
        try { await debugWin.setFocus(); } catch {}
      });

      debugWin.once('tauri://error', (e) => {
        console.error('[useDebugWindow] 窗口创建错误:', e);
      });

      debugWin.once('destroyed', () => {
        winRef.current = null;
        onCloseRef.current();
      });
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  /** isOpen 变为 false 时关闭窗口 */
  useEffect(() => {
    if (isOpen || !isTauri()) return;

    (async () => {
      try {
        const win = winRef.current || await WebviewWindow.getByLabel(DEBUG_LABEL);
        if (win) {
          winRef.current = null;
          await win.destroy();
        }
      } catch { /* 窗口可能已不存在 */ }
    })();
  }, [isOpen]);

  /** 监听调试窗口主动发来的关闭通知 */
  useEffect(() => {
    if (!isTauri()) return;

    const unlisten = listen('debug-closed', () => {
      winRef.current = null;
      onCloseRef.current();
    });

    return () => { unlisten.then(fn => fn()); };
  }, []);

  /** 组件卸载时关闭窗口 */
  useEffect(() => {
    return () => {
      if (winRef.current) {
        winRef.current.destroy().catch(() => {});
        winRef.current = null;
      }
    };
  }, []);
}
