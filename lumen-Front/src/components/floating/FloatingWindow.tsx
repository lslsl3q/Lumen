/**
 * FloatingWindow — 居中弹窗（Phase B 基础版）
 *
 * Portal 到 #overlay-root，无拖拽/缩放。
 * 用于世界书详情查看等场景。
 */
import { createPortal } from 'react-dom';

interface FloatingWindowProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}

function FloatingWindow({ open, title, onClose, children }: FloatingWindowProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-overlay-fade-in" />

      {/* 面板 */}
      <div className="relative w-[640px] max-h-[80vh] flex flex-col bg-slate-900/98 rounded-xl
        border border-slate-700/40 shadow-[0_16px_48px_rgba(0,0,0,0.4)] soft-panel
        animate-modal-in"
      >
        {/* 标题栏 */}
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

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto scrollbar-lumen p-5">
          {children}
        </div>
      </div>
    </div>,
    document.getElementById('overlay-root')!
  );
}

export default FloatingWindow;
