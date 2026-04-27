/**
 * ContextPanel — 右侧滑出快选面板
 *
 * 从 RightRail 左侧滑出（right-10），w-72。
 * 根据 kind 渲染不同的选择器面板。
 * 选择后自动关闭（Author's Note 例外 — 编辑型面板）。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ContextPanelKind } from './useFloatingLayers';
import CharacterSelector from '../CharacterSelector';
import PersonaPanel from '../PersonaPanel';
import WorldBookPanel from '../WorldBookPanel';
import AuthorNotePanel from '../AuthorNotePanel';
import type { CharacterListItem } from '../../types/character';
import type { PersonaListItem } from '../../types/persona';
import type { AuthorsNoteConfig } from '../../types/authorNote';

interface ContextPanelProps {
  open: boolean;
  kind: ContextPanelKind | null;
  onClose: () => void;
  characters: CharacterListItem[];
  currentCharacterId: string;
  onSwitchCharacter: (characterId: string) => void;
  onManageCharacters: () => void;
  personas: PersonaListItem[];
  activePersonaId: string | null;
  activePersonaName: string | null;
  onSwitchPersona: (personaId: string | null) => void;
  onManagePersonas: () => void;
  onManageWorldBooks: () => void;
  authorNoteConfig: AuthorsNoteConfig | null;
  authorNoteLoading: boolean;
  onAuthorNoteSaveContent: (content: string) => void;
  onAuthorNoteSetPosition: (position: 'before_user' | 'after_user') => void;
}

const KIND_LABELS: Record<ContextPanelKind, string> = {
  character: '选择角色',
  persona: '用户身份',
  worldbook: '世界书',
  authornote: "Author's Note",
};

function ContextPanel({
  open,
  kind,
  onClose,
  characters,
  currentCharacterId,
  onSwitchCharacter,
  onManageCharacters,
  personas,
  activePersonaId,
  activePersonaName,
  onSwitchPersona,
  onManagePersonas,
  onManageWorldBooks,
  authorNoteConfig,
  authorNoteLoading,
  onAuthorNoteSaveContent,
  onAuthorNoteSetPosition,
}: ContextPanelProps) {
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef<ContextPanelKind | null>(null);

  // 保持 kind 的最新引用
  kindRef.current = kind;

  const handleClose = useCallback(() => {
    setIsClosing(prev => {
      if (prev) return prev; // 已经在关闭中
      setTimeout(() => {
        setIsClosing(false);
        onClose();
      }, 200);
      return true;
    });
  }, [onClose]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    // 延迟绑定避免打开时的点击立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, handleClose]);

  if (!open || !kind) return null;

  return (
    <div
      ref={panelRef}
      className={`absolute right-10 top-0 bottom-0 w-72 flex flex-col
        bg-slate-950/98 backdrop-blur-sm border-l border-slate-800/30
        shadow-[-6px_0_20px_rgba(0,0,0,0.35)] z-40
        ${isClosing ? 'animate-slide-out' : 'animate-slide-in'}`}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3
        bg-slate-900/30 border-b border-slate-800/30">
        <span className="text-xs font-medium tracking-wide text-slate-400 font-display">
          {KIND_LABELS[kind]}
        </span>
        <button
          onClick={handleClose}
          className="w-6 h-6 rounded flex items-center justify-center
            text-slate-600 hover:text-slate-300 hover:bg-slate-800/60
            transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen">
        {kind === 'character' && (
          <CharacterSelector
            characters={characters}
            currentCharacterId={currentCharacterId}
            onSelect={onSwitchCharacter}
            onManageClick={onManageCharacters}
          />
        )}
        {kind === 'persona' && (
          <PersonaPanel
            personas={personas}
            activeId={activePersonaId}
            activeName={activePersonaName}
            onSelect={onSwitchPersona}
            onManageClick={onManagePersonas}
          />
        )}
        {kind === 'worldbook' && (
          <WorldBookPanel onManageClick={onManageWorldBooks} />
        )}
        {kind === 'authornote' && (
          <AuthorNotePanel
            config={authorNoteConfig}
            isLoading={authorNoteLoading}
            onSaveContent={onAuthorNoteSaveContent}
            onSetPosition={onAuthorNoteSetPosition}
          />
        )}
      </div>
    </div>
  );
}

export default ContextPanel;
