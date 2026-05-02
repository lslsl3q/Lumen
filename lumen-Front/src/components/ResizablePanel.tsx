/**
 * ResizablePanel — 可拖拽调宽的侧边栏容器
 *
 * 复用 useResizableWidth hook，行为与 SidePanel 一致：
 * - 拖拽右边缘调宽
 * - 双击恢复默认
 * - 可选 localStorage 持久化
 *
 * 用法：
 * <ResizablePanel defaultWidth={192} minWidth={128} maxWidth={320}>
 *   {children}
 * </ResizablePanel>
 */
import type { ReactNode } from 'react';
import { useResizableWidth } from '../hooks/useResizableWidth';

interface ResizablePanelProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** localStorage key，空则不持久化 */
  storageKey?: string;
  className?: string;
  children: ReactNode;
}

function ResizablePanel({
  defaultWidth = 192,
  minWidth = 128,
  maxWidth = 320,
  storageKey,
  className = '',
  children,
}: ResizablePanelProps) {
  const { width, isDragging, handleMouseDown, handleDoubleClick } = useResizableWidth({
    defaultWidth,
    minWidth,
    maxWidth,
    storageKey,
  });

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width }}
    >
      {children}

      {/* 拖拽手柄 */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`absolute top-0 right-0 bottom-0 w-[3px] cursor-col-resize z-10
          transition-colors duration-100
          ${isDragging
            ? 'bg-amber-500/40'
            : 'hover:bg-amber-500/20'
          }`}
        title="拖拽调整宽度 · 双击恢复默认"
      />
    </div>
  );
}

export default ResizablePanel;
