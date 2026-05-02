/**
 * FloatingWindow — 双模式浮窗
 *
 * modal: 居中 + 遮罩（默认，向后兼容）
 * float: 无遮罩 + 可拖拽 + 可缩放（调试面板等持久浮窗）
 */
import { useRef, useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

interface FloatingWindowProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  /** 'modal' 居中遮罩 | 'float' 自由定位（默认 modal） */
  mode?: 'modal' | 'float';
  /** float 模式初始位置（默认右上角） */
  initialPos?: { x: number; y: number };
  /** float 模式初始尺寸（默认 560×480） */
  initialSize?: { width: number; height: number };
  /** float 模式右下缩放手柄（默认 false） */
  resizable?: boolean;
}

/** 拖拽 + 缩放逻辑 */
function useFloatDrag(
  initialPos: { x: number; y: number },
  initialSize: { width: number; height: number },
) {
  const [pos, setPos] = useState(initialPos);
  const [size, setSize] = useState(initialSize);
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onDragStart = useCallback((e: ReactMouseEvent) => {
    // 阻止文本选择
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: pos.x,
      startTop: pos.y,
    };

    const onMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: dragRef.current.startLeft + dx,
        y: dragRef.current.startTop + dy,
      });
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [pos.x, pos.y]);

  const onResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };

    const onMove = (ev: globalThis.MouseEvent) => {
      if (!resizeRef.current) return;
      const minW = 320;
      const minH = 240;
      setSize({
        width: Math.max(minW, resizeRef.current.startW + ev.clientX - resizeRef.current.startX),
        height: Math.max(minH, resizeRef.current.startH + ev.clientY - resizeRef.current.startY),
      });
    };

    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size.width, size.height]);

  return { pos, size, onDragStart, onResizeStart };
}

function FloatingWindow({
  open,
  title,
  onClose,
  children,
  mode = 'modal',
  initialPos,
  initialSize,
  resizable = false,
}: FloatingWindowProps) {
  if (!open) return null;

  // 默认位置：右上角
  const _ip = initialPos ?? { x: window.innerWidth - 620, y: 60 };
  const _is = initialSize ?? { width: 560, height: 480 };

  return createPortal(
    mode === 'float'
      ? <FloatPanel title={title} onClose={onClose} initialPos={_ip} initialSize={_is} resizable={resizable}>{children}</FloatPanel>
      : <ModalPanel title={title} onClose={onClose}>{children}</ModalPanel>,
    document.getElementById('overlay-root')!,
  );
}

/** modal 模式 — 居中 + 遮罩 */
function ModalPanel({ title, onClose, children }: {
  title: string; onClose: () => void; children?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-overlay-fade-in" />
      <div className="relative w-[640px] max-h-[80vh] flex flex-col bg-slate-900/98 rounded-xl
        border border-slate-700/40 shadow-[0_16px_48px_rgba(0,0,0,0.4)] soft-panel
        animate-modal-in"
      >
        <PanelHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-y-auto scrollbar-lumen p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/** float 模式 — 无遮罩 + 可拖拽 + 可缩放 */
function FloatPanel({ title, onClose, initialPos, initialSize, resizable, children }: {
  title: string; onClose: () => void;
  initialPos: { x: number; y: number };
  initialSize: { width: number; height: number };
  resizable: boolean;
  children?: React.ReactNode;
}) {
  const { pos, size, onDragStart, onResizeStart } = useFloatDrag(initialPos, initialSize);

  // Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 flex flex-col bg-slate-900/98 rounded-xl
        border border-slate-700/40 shadow-[0_12px_40px_rgba(0,0,0,0.4)] soft-panel
        pointer-events-auto animate-float-in"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* 标题栏 — 拖拽手柄 */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/40 cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-xs font-medium tracking-wide text-slate-400 font-display">{title}</span>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-5 h-5 rounded flex items-center justify-center
            text-slate-600 hover:text-slate-300 hover:bg-slate-800/60
            transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen">
        {children}
      </div>

      {/* 缩放手柄 */}
      {resizable && (
        <div
          onMouseDown={onResizeStart}
          className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize
            flex items-end justify-end pr-1 pb-1"
        >
          <svg className="w-2.5 h-2.5 text-slate-700" fill="currentColor" viewBox="0 0 8 8">
            <circle cx="6" cy="2" r="0.8" />
            <circle cx="6" cy="6" r="0.8" />
            <circle cx="2" cy="6" r="0.8" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** 共享标题栏（modal 模式用） */
function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/40">
      <span className="text-sm font-medium text-slate-200 font-display">{title}</span>
      <button
        onClick={onClose}
        className="w-6 h-6 rounded flex items-center justify-center
          text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
          transition-all duration-150 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default FloatingWindow;
