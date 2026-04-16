/**
 * 侧边栏角色选择器 — 纯渲染组件
 *
 * 职责：在侧边栏底部显示当前角色，点击展开下拉菜单切换角色
 * 所有数据和回调来自 props
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

  const current = characters.find(c => c.id === currentCharacterId);

  return (
    <div ref={dropdownRef} className="relative border-t border-slate-800/40">
      {/* 当前角色按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          w-full px-4 py-3 flex items-center gap-3
          hover:bg-slate-800/40 transition-all duration-150
        "
      >
        {/* 头像 */}
        <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {current?.avatar ? (
            <img
              src={getAvatarUrl(current.avatar)!}
              alt={current.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-slate-400">
              {(current?.name || '?')[0]}
            </span>
          )}
        </div>
        {/* 名字 */}
        <div className="flex-1 text-left">
          <div className="text-sm text-slate-300 truncate">{current?.name || '选择角色'}</div>
        </div>
        {/* 展开箭头 */}
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
          {/* 角色列表 */}
          <div className="max-h-64 overflow-y-auto scrollbar-lumen">
            {characters.map(char => (
              <button
                key={char.id}
                onClick={() => {
                  onSelect(char.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full px-4 py-2.5 flex items-center gap-3
                  transition-all duration-100
                  ${char.id === currentCharacterId
                    ? 'bg-teal-500/10 text-teal-300'
                    : 'text-slate-300 hover:bg-slate-800/60'
                  }
                `}
              >
                <div className="w-6 h-6 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {char.avatar ? (
                    <img src={getAvatarUrl(char.avatar)!} alt={char.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-slate-400">{char.name[0]}</span>
                  )}
                </div>
                <span className="text-sm truncate">{char.name}</span>
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
              管理角色...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterSelector;
