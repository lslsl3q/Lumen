/**
 * GraphWindow — 图谱编辑器独立窗口
 *
 * 从 MemoryWindow 拆分出来，通过 ActivityBar 独立唤起。
 * 自带 TDB 选择器，默认 knowledge。
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import GraphEditor from './GraphEditor';
import { listTdbs } from '../api/tdb';
import type { TdbInfo } from '../api/tdb';

interface GraphWindowProps {
  open: boolean;
  onClose: () => void;
}

function GraphWindow({ open, onClose }: GraphWindowProps) {
  const [tdbs, setTdbs] = useState<TdbInfo[]>([]);
  const [activeTdb, setActiveTdb] = useState('knowledge');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!open) return;
    listTdbs().then(data => {
      setTdbs(data.tdbs || []);
    }).catch(() => {});
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-[#1C1B19]/80 backdrop-blur-sm animate-overlay-fade-in" />

      <div
        className={`relative flex flex-col overflow-hidden
          bg-[#1a1a18] border border-[#2a2926]
          shadow-[0_24px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(204,124,94,0.05)]
          animate-modal-in transition-all duration-200
          ${isFullscreen ? 'rounded-none' : 'rounded-xl'}`}
        style={isFullscreen ? { width: '100%', height: '100%' } : { width: 1152, height: 768 }}
      >
        {/* ── 标题栏 ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2926] bg-[#1f1f1c] flex-shrink-0">
          <span className="text-sm font-light text-slate-300 tracking-wide">图谱编辑器</span>

          {/* TDB 选择 */}
          <div className="flex gap-0.5 bg-[#1C1B19] rounded-lg p-0.5">
            {tdbs.map(tdb => (
              <button
                key={tdb.name}
                onClick={() => setActiveTdb(tdb.name)}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-all duration-150 cursor-pointer
                  ${activeTdb === tdb.name
                    ? 'bg-[#2a2926] text-slate-200'
                    : 'text-slate-600 hover:text-slate-400'
                  }`}
              >
                {tdb.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setIsFullscreen(v => !v)}
              className="w-6 h-6 rounded flex items-center justify-center cursor-pointer
                text-slate-600 hover:text-slate-300 hover:bg-[#2a2926] transition-colors"
              title={isFullscreen ? '还原' : '全屏'}
            >
              {isFullscreen ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                  <rect x="4" y="1" width="11" height="11" rx="1" strokeWidth="1.2" />
                  <rect x="1" y="4" width="11" height="11" rx="1" strokeWidth="1.2" strokeOpacity="0.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                  <rect x="2" y="2" width="12" height="12" rx="1" strokeWidth="1.2" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center cursor-pointer
                text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div className="flex-1 min-h-0">
          <GraphEditor tdb={activeTdb} />
        </div>
      </div>
    </div>,
    document.getElementById('overlay-root')!,
  );
}

export default GraphWindow;
