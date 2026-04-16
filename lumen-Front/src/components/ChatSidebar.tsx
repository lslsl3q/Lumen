/**
 * 会话侧边栏 — 纯渲染组件
 *
 * 职责：显示会话列表，用户可选择、新建、删除会话
 * 底部包含角色选择器，可快速切换角色
 * 所有数据和回调来自 props，不管理状态
 */
import { SessionListItem } from '../types/session';
import { CharacterListItem } from '../types/character';
import CharacterSelector from './CharacterSelector';

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
}

/** 单个会话条目 */
function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  formatLabel,
}: {
  session: SessionListItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  formatLabel: (sessionId: string) => string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        group relative px-4 py-3 cursor-pointer transition-all duration-150
        ${isActive
          ? 'bg-teal-500/5 border-l-2 border-teal-400'
          : 'border-l-2 border-transparent hover:bg-slate-800/40'
        }
      `}
    >
      {/* 会话标签 */}
      <div className={`text-sm ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
        {formatLabel(session.session_id)}
      </div>
      {/* 角色名 */}
      <div className="text-xs text-slate-500 mt-0.5">
        {session.character_id}
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
}: ChatSidebarProps) {
  return (
    <div className="w-64 flex flex-col bg-slate-950/80 border-r border-slate-800/40">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
          <span className="text-sm font-light tracking-widest text-slate-400 uppercase">
            Lumen
          </span>
        </div>
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
          sessions.map((session) => (
            <SessionItem
              key={session.session_id}
              session={session}
              isActive={session.session_id === currentSessionId}
              onSelect={() => onSelectSession(session.session_id)}
              onDelete={() => onDeleteSession(session.session_id)}
              formatLabel={formatLabel}
            />
          ))
        )}
      </div>

      {/* 底部角色选择器 */}
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
