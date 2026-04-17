/**
 * 侧边栏 Persona 切换器 — 复用 CharacterSelector 的下拉菜单模式
 *
 * 职责：在侧边栏底部显示当前 Persona，点击展开下拉菜单切换
 * 所有数据和回调来自 props
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

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative border-t border-slate-800/40">
      {/* 当前 Persona 按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          w-full px-4 py-2.5 flex items-center gap-3
          hover:bg-slate-800/40 transition-all duration-150
        "
      >
        {/* 图标 */}
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        {/* 名字 */}
        <div className="flex-1 text-left">
          <div className="text-xs text-slate-500">用户身份</div>
          <div className="text-sm text-slate-300 truncate">
            {activeName || '未设置'}
          </div>
        </div>
        {/* 展开箭头 */}
        <svg
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="
          absolute bottom-full left-0 right-0 mb-1
          bg-slate-900 border border-slate-700/60 rounded-lg
          shadow-xl shadow-black/40 overflow-hidden z-50
        ">
          {/* "无" 选项 */}
          <button
            onClick={() => {
              onSelect(null);
              setIsOpen(false);
            }}
            className={`
              w-full px-4 py-2.5 flex items-center gap-3
              transition-all duration-100
              ${activeId === null
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-slate-400 hover:bg-slate-800/60'
              }
            `}
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
                onClick={() => {
                  onSelect(p.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full px-4 py-2.5 flex items-center gap-3
                  transition-all duration-100
                  ${p.id === activeId
                    ? 'bg-indigo-500/10 text-indigo-300'
                    : 'text-slate-300 hover:bg-slate-800/60'
                  }
                `}
              >
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center">
                  <span className="text-[10px] text-indigo-400">{p.name[0]}</span>
                </div>
                <span className="text-sm truncate">{p.name}</span>
              </button>
            ))}
          </div>

          {/* 管理按钮 */}
          <div className="border-t border-slate-700/60">
            <button
              onClick={() => {
                onManageClick();
                setIsOpen(false);
              }}
              className="
                w-full px-4 py-2.5 text-left text-sm text-slate-400
                hover:bg-slate-800/60 hover:text-slate-200
                transition-all duration-100
              "
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
