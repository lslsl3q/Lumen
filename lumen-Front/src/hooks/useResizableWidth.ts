/**
 * useResizableWidth — 拖拽调宽 hook
 *
 * 从 SidePanel 提取的通用逻辑：
 * - mousedown/mousemove/mouseup 拖拽
 * - localStorage 持久化宽度
 * - 双击恢复默认
 * - 拖拽期间禁用文本选择 + 设置 cursor
 */
import { useState, useCallback, useRef } from 'react';

interface UseResizableWidthOptions {
  /** 默认宽度 */
  defaultWidth: number;
  /** 最小宽度 */
  minWidth: number;
  /** 最大宽度 */
  maxWidth: number;
  /** localStorage key，空字符串 = 不持久化 */
  storageKey?: string;
}

interface UseResizableWidthReturn {
  /** 当前宽度 */
  width: number;
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 绑定到拖拽手柄的 onMouseDown */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** 双击恢复默认宽度 */
  handleDoubleClick: () => void;
}

function readStored(storageKey: string | undefined, defaultWidth: number, minWidth: number, maxWidth: number): number {
  if (!storageKey) return defaultWidth;
  try {
    const v = localStorage.getItem(storageKey);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= minWidth && n <= maxWidth) return n;
    }
  } catch { /* ignore */ }
  return defaultWidth;
}

function writeStored(storageKey: string | undefined, width: number) {
  if (!storageKey) return;
  try { localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
}

function clamp(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}

export function useResizableWidth({
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
}: UseResizableWidthOptions): UseResizableWidthReturn {
  const [width, setWidth] = useState(() => readStored(storageKey, defaultWidth, minWidth, maxWidth));
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startWidth: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startWidth: width };

    const body = document.body;
    body.style.userSelect = 'none';
    body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - dragRef.current.startX;
      const next = clamp(dragRef.current.startWidth + delta, minWidth, maxWidth);
      setWidth(next);
    };

    const onMouseUp = (ev: MouseEvent) => {
      const delta = ev.clientX - dragRef.current.startX;
      const final = clamp(dragRef.current.startWidth + delta, minWidth, maxWidth);
      setWidth(final);
      setIsDragging(false);
      body.style.userSelect = '';
      body.style.cursor = '';
      writeStored(storageKey, final);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, minWidth, maxWidth, storageKey]);

  const handleDoubleClick = useCallback(() => {
    setWidth(defaultWidth);
    writeStored(storageKey, defaultWidth);
  }, [defaultWidth, storageKey]);

  return { width, isDragging, handleMouseDown, handleDoubleClick };
}
