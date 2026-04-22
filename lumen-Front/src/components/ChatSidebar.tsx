/**
 * 会话侧边栏 — 纯渲染组件
 *
 * 职责：显示会话列表，用户可选择、新建、删除会话
 * 底部包含角色选择器，可快速切换角色
 * 所有数据和回调来自 props，不管理状态
 */
import { SessionListItem } from '../types/session';
import { CharacterListItem } from '../types/character';
import { PersonaListItem } from '../types/persona';
import { AuthorsNoteConfig } from '../types/authorNote';
import CharacterSelector from './CharacterSelector';
import PersonaPanel from './PersonaPanel';
import AuthorNotePanel from './AuthorNotePanel';
import WorldBookPanel from './WorldBookPanel';

interface ChatSidebarProps {
  sessions: SessionListItem[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  formatLabel: (sessionId: string) => string;
  // 角色相关
  characters: CharacterListItem[];
  currentCharacterId: string;
  onSwitchCharacter: (characterId: string) => void;
  onManageCharacters: () => void;
  // 设置
  onOpenSettings: () => void;
  // Persona 相关
  personas: PersonaListItem[];
  activePersonaId: string | null;
  activePersonaName: string | null;
  onSwitchPersona: (personaId: string | null) => void;
  onManagePersonas: () => void;
  // World Book 相关
  onManageWorldBooks: () => void;
  // Author's Note 相关
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
        group relative px-4 py-3 cursor-pointer transition-all duration-150 mx-2 rounded-[10px]
        ${isActive
          ? 'bg-amber-500/10 soft-item'
          : 'hover:bg-slate-800/40'
        }
      `}
    >
      {/* 会话标签 */}
      <div className={`text-sm ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
        {formatLabel(session.session_id)}
      </div>
      {/* 角色名 */}
      <div className="text-xs text-slate-500 mt-0.5">
        {characterName}
      </div>
      {/* 删除按钮 — hover 时显示 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          w-6 h-6 rounded flex items-center justify-center
          text-slate-600 hover:text-red-400 hover:bg-red-500/10
          opacity-0 group-hover:opacity-100 transition-all duration-150
        "
        title="删除会话"
      >
        &times;
      </button>
    </div>
  );
}

function ChatSidebar({
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
}: ChatSidebarProps) {
  return (
    <div className="w-45 flex flex-col bg-slate-950/80 border-r border-slate-800/40 soft-panel">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(204,124,94,0.6)]" />
          <span className="text-sm font-light tracking-widest text-slate-400 uppercase">
            Lumen
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSettings}
            className="
              w-7 h-7 rounded-lg flex items-center justify-center
              text-slate-400 hover:text-amber-400
              hover:bg-amber-500/10
              transition-all duration-150
            "
            title="设置"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onNewSession}
            className="
              w-7 h-7 rounded-lg flex items-center justify-center
              text-amber-400 bg-amber-500/10 border border-amber-500/20
              hover:bg-amber-500/20 hover:border-amber-500/40
              transition-all duration-150 text-lg leading-none
            "
            title="新建会话"
          >
            +
          </button>
        </div>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-xs text-slate-600">
            加载中...
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-600">
            暂无会话
          </div>
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

      {/* 底部：Author's Note + Persona 切换 + 角色选择器 */}
      {/* 只有在有会话时才显示 Author's Note（因为它是会话级别的配置） */}
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
      {/* 角色选择器 */}
      <CharacterSelector
        characters={characters}
        currentCharacterId={currentCharacterId}
        onSelect={onSwitchCharacter}
        onManageClick={onManageCharacters}
      />
    </div>
  );
}

export default ChatSidebar;