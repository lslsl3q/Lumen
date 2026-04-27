/**
 * Persona 切换器 — ContextPanel 内使用
 *
 * 职责：显示当前用户身份 + 下拉菜单切换
 * 统一 amber 暖棕配色（不再用 indigo）
 */
import { useState, useRef, useEffect } from 'react';
import { PersonaListItem } from '../types/persona';

interface PersonaPanelProps {
  personas: PersonaListItem[];
  activeId: string | null;
  activeName: string | null;
  onSelect: (personaId: string | null) => void;
  onManageClick: () => void;
}

function PersonaPanel({
  personas,
  activeId,
  activeName,
  onSelect,
  onManageClick,
}: PersonaPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative p-3">
      {/* 当前 Persona 按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
          hover:bg-slate-800/40 transition-all duration-150 cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex-shrink-0 flex items-center justify-center">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[10px] text-slate-600">用户身份</div>
          <div className="text-sm text-slate-300 truncate">{activeName || '未设置'}</div>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 — 向下展开 */}
      {isOpen && (
        <div className="absolute top-full left-3 right-3 mt-1
          bg-slate-900/98 border border-slate-700/60 rounded-lg
          shadow-xl shadow-black/40 overflow-hidden z-50">
          {/* "不使用" 选项 */}
          <button
            onClick={() => { onSelect(null); setIsOpen(false); }}
            className={`w-full px-3 py-2.5 flex items-center gap-3 transition-all duration-100 cursor-pointer
              ${activeId === null
                ? 'bg-amber-500/10 text-amber-300'
                : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
          >
            <div className="w-6 h-6 rounded-full bg-slate-800 flex-shrink-0 flex items-center justify-center">
              <span className="text-[10px] text-slate-500">-</span>
            </div>
            <span className="text-sm">不使用</span>
          </button>

          {/* Persona 列表 */}
          <div className="max-h-48 overflow-y-auto scrollbar-lumen">
            {personas.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setIsOpen(false); }}
                className={`w-full px-3 py-2.5 flex items-center gap-3 transition-all duration-100 cursor-pointer
                  ${p.id === activeId
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-amber-500/10 flex-shrink-0 flex items-center justify-center">
                  <span className="text-[10px] text-amber-400">{p.name[0]}</span>
                </div>
                <span className="text-sm truncate">{p.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-700/60">
            <button
              onClick={() => { onManageClick(); setIsOpen(false); }}
              className="w-full px-3 py-2.5 text-left text-sm text-slate-500
                hover:bg-slate-800/60 hover:text-slate-300 transition-all duration-100 cursor-pointer"
            >
              管理 Persona...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PersonaPanel;
