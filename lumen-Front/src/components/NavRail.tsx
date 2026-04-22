/**
 * 导航栏（NavRail）— 全局左侧导航
 *
 * 三段式结构：
 * - Header: 品牌 + 模式占位 + 设置 + 新建
 * - Body:   当前模式的导航列表（Chat 模式为会话列表）
 * - Footer: 紧凑功能图标 + 配置面板（Phase B 迁移到浮动层）
 */
import { SessionListItem } from '../types/session';
import { CharacterListItem } from '../types/character';
import { PersonaListItem } from '../types/persona';
import { AuthorsNoteConfig } from '../types/authorNote';
import CharacterSelector from './CharacterSelector';
import PersonaPanel from './PersonaPanel';
import AuthorNotePanel from './AuthorNotePanel';
import WorldBookPanel from './WorldBookPanel';

interface NavRailProps {
  // Sessions
  sessions: SessionListItem[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  formatLabel: (sessionId: string) => string;
  // Characters
  characters: CharacterListItem[];
  currentCharacterId: string;
  onSwitchCharacter: (characterId: string) => void;
  onManageCharacters: () => void;
  // Settings
  onOpenSettings: () => void;
  // Persona
  personas: PersonaListItem[];
  activePersonaId: string | null;
  activePersonaName: string | null;
  onSwitchPersona: (personaId: string | null) => void;
  onManagePersonas: () => void;
  // World Book
  onManageWorldBooks: () => void;
  // Author's Note
  authorNoteConfig: AuthorsNoteConfig | null;
  authorNoteLoading: boolean;
  onAuthorNoteSaveContent: (content: string) => void;
  onAuthorNoteSetPosition: (position: 'before_user' | 'after_user') => void;
}

/** 单个会话条目 */
function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  formatLabel,
  characterName,
}: {
  session: SessionListItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  formatLabel: (sessionId: string) => string;
  characterName: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        group relative flex items-center gap-2 px-3 py-2 cursor-pointer
        transition-all duration-150 mx-2 rounded-full
        ${isActive
          ? 'bg-amber-500/10 text-slate-200 soft-item'
          : 'hover:bg-slate-800/40 text-slate-400'
        }
      `}
    >
      <span className="text-sm truncate flex-1">
        {formatLabel(session.session_id)}
      </span>
      <span className="text-[10px] text-slate-600 truncate max-w-16">
        {characterName}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="
          w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0
          text-slate-600 hover:text-red-400 hover:bg-red-500/10
          opacity-0 group-hover:opacity-100 transition-all duration-150 text-[10px]
        "
        title="删除会话"
      >
        &times;
      </button>
    </div>
  );
}

function NavRail({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  formatLabel,
  characters,
  currentCharacterId,
  onSwitchCharacter,
  onManageCharacters,
  onOpenSettings,
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
}: NavRailProps) {
  return (
    <div className="w-56 flex flex-col bg-slate-950/80 border-r border-slate-800/40 soft-panel">
      {/* Header: 品牌 + 功能按钮 */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(204,124,94,0.6)]" />
          <span className="text-sm font-light tracking-widest text-slate-400 uppercase font-display">Lumen</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 模式切换占位 — Phase C 实现 */}
          <button
            className="w-6 h-6 rounded flex items-center justify-center
              text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
              transition-all duration-150"
            title="模式切换（即将推出）"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              />
            </svg>
          </button>
          {/* 设置 */}
          <button
            onClick={onOpenSettings}
            className="w-6 h-6 rounded flex items-center justify-center
              text-slate-400 hover:text-amber-400 hover:bg-amber-500/10
              transition-all duration-150"
            title="设置"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* 新建会话 */}
          <button
            onClick={onNewSession}
            className="w-6 h-6 rounded flex items-center justify-center
              text-amber-400 bg-amber-500/10 border border-amber-500/20
              hover:bg-amber-500/20 hover:border-amber-500/40
              transition-all duration-150 text-sm leading-none"
            title="新建会话"
          >
            +
          </button>
        </div>
      </div>

      {/* Body: 会话列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-xs text-slate-600">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-600">暂无会话</div>
        ) : (
          sessions.map((session) => {
            const char = characters.find(c => c.id === session.character_id);
            return (
              <SessionItem
                key={session.session_id}
                session={session}
                isActive={session.session_id === currentSessionId}
                onSelect={() => onSelectSession(session.session_id)}
                onDelete={() => onDeleteSession(session.session_id)}
                formatLabel={formatLabel}
                characterName={char?.display_name || char?.name || session.character_id}
              />
            );
          })
        )}
      </div>

      {/* Footer: 配置面板（Phase B 迁移到浮动层） */}
      <div className="border-t border-slate-800/40">
        {currentSessionId && (
          <AuthorNotePanel
            config={authorNoteConfig}
            isLoading={authorNoteLoading}
            onSaveContent={onAuthorNoteSaveContent}
            onSetPosition={onAuthorNoteSetPosition}
          />
        )}
        <PersonaPanel
          personas={personas}
          activeId={activePersonaId}
          activeName={activePersonaName}
          onSelect={onSwitchPersona}
          onManageClick={onManagePersonas}
        />
        <WorldBookPanel onManageClick={onManageWorldBooks} />
        <CharacterSelector
          characters={characters}
          currentCharacterId={currentCharacterId}
          onSelect={onSwitchCharacter}
          onManageClick={onManageCharacters}
        />
      </div>
    </div>
  );
}

export default NavRail;
