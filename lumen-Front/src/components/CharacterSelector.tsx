/**
 * 角色选择器 — ContextPanel 内使用
 *
 * 职责：显示当前角色 + 下拉菜单切换角色
 * 下拉向下展开（面板内使用），选后自动关闭
 */
import { useState, useRef, useEffect } from 'react';
import { CharacterListItem } from '../types/character';
import { getAvatarUrl } from '../api/character';

interface CharacterSelectorProps {
  characters: CharacterListItem[];
  currentCharacterId: string;
  onSelect: (characterId: string) => void;
  onManageClick: () => void;
}

function CharacterSelector({
  characters,
  currentCharacterId,
  onSelect,
  onManageClick,
}: CharacterSelectorProps) {
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

  const current = characters.find(c => c.id === currentCharacterId);

  return (
    <div ref={dropdownRef} className="relative p-3">
      {/* 当前角色按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
          hover:bg-slate-800/40 transition-all duration-150 cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {current?.avatar ? (
            <img src={getAvatarUrl(current.avatar)!} alt={current.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-amber-400">{(current?.name || '?')[0]}</span>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[10px] text-slate-600">当前角色</div>
          <div className="text-sm text-slate-300 truncate">{current?.display_name || current?.name || '选择角色'}</div>
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
          <div className="max-h-64 overflow-y-auto scrollbar-lumen">
            {characters.map(char => (
              <button
                key={char.id}
                onClick={() => { onSelect(char.id); setIsOpen(false); }}
                className={`w-full px-3 py-2.5 flex items-center gap-3 transition-all duration-100 cursor-pointer
                  ${char.id === currentCharacterId
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {char.avatar ? (
                    <img src={getAvatarUrl(char.avatar)!} alt={char.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-amber-400">{char.name[0]}</span>
                  )}
                </div>
                <span className="text-sm truncate">{char.display_name || char.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-700/60">
            <button
              onClick={() => { onManageClick(); setIsOpen(false); }}
              className="w-full px-3 py-2.5 text-left text-sm text-slate-500
                hover:bg-slate-800/60 hover:text-slate-300 transition-all duration-100 cursor-pointer"
            >
              管理角色...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterSelector;
