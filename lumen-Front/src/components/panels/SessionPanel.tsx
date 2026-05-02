/**
 * SessionPanel — 会话列表面板（SidePanel 内容）
 *
 * 从 NavRail 提取的会话列表，含新建/选择/删除/双击重命名
 */
import { useState, useRef } from 'react';
import { SessionListItem } from '../../types/session';
import { CharacterListItem } from '../../types/character';
import { handleListKeyDown, navItemClass } from './shared/listNavigation';

interface SessionPanelProps {
  sessions: SessionListItem[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  formatLabel: (sessionId: string) => string;
  characters: CharacterListItem[];
}

/** 会话条目 */
function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
  formatLabel,
  characterName,
}: {
  session: SessionListItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (sessionId: string, title: string) => void;
  formatLabel: (sessionId: string) => string;
  characterName: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayLabel = session.title || formatLabel(session.session_id);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(displayLabel);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onRename(session.session_id, trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div
      data-nav-item
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onKeyDown={e => { if (!isEditing && e.key === 'Enter') onSelect(); }}
      className={`
        group relative flex items-center gap-1.5 px-3 py-1.5 cursor-pointer
        mx-2 rounded-full my-px ${navItemClass}
        ${isActive
          ? 'bg-amber-500/10 text-slate-200'
          : 'text-slate-400'
        }
      `}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          className="flex-1 text-sm bg-slate-800/50 rounded px-2 py-0.5
            text-slate-200 outline-none border border-amber-500/30"
          autoFocus
        />
      ) : (
        <span className="text-sm truncate flex-1">{displayLabel}</span>
      )}
      {!isEditing && (
        <>
          <span className="text-[10px] text-slate-600 truncate max-w-14">
            {characterName}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0
              text-slate-600 hover:text-red-400
              opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px]"
            title="删除会话"
          >
            &times;
          </button>
        </>
      )}
    </div>
  );
}

function SessionPanel({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  formatLabel,
  characters,
}: SessionPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[10px] text-slate-600 font-medium tracking-wider uppercase">Sessions</span>
        <button
          onClick={onNewSession}
          className="w-6 h-6 rounded-md flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800/40
            transition-colors duration-150 cursor-pointer"
          title="新建会话"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen" onKeyDown={handleListKeyDown}>
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
                onRename={onRenameSession}
                formatLabel={formatLabel}
                characterName={char?.display_name || char?.name || session.character_id}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default SessionPanel;
