/**
 * 导航栏（NavRail）— 可伸缩左侧导航
 *
 * 展开状态: + 按钮 + "New session" 文字 + 会话列表 + 底部功能
 * 收缩状态: 仅图标（与展开状态图标一致）
 * 支持拖拽调整宽度 + 双击重命名会话
 */
import { useState, useRef, useCallback } from 'react';
import { SessionListItem } from '../types/session';
import { CharacterListItem } from '../types/character';
import type { ContextPanelKind } from './floating/useFloatingLayers';
import type { AuthorsNoteConfig } from '../types/authorNote';

const DEFAULT_WIDTH = 200;
const MIN_WIDTH = 160;
const MAX_WIDTH = 320;
const COLLAPSED_WIDTH = 48;

interface NavRailProps {
  sessions: SessionListItem[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  formatLabel: (sessionId: string) => string;
  characters: CharacterListItem[];
  currentCharacterId: string;
  activePersonaName: string | null;
  authorNoteConfig: AuthorsNoteConfig | null;
  onOpenContextPanel: (kind: ContextPanelKind) => void;
  onOpenSettings: () => void;
}

/** 统一图标按钮样式 */
const iconBtn = `w-7 h-7 rounded-lg flex items-center justify-center
  text-slate-500 cursor-pointer`;

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
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      className={`
        group relative flex items-center gap-1.5 px-3 py-1.5 cursor-pointer
        mx-2 rounded-full my-px
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

function NavRail({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  formatLabel,
  characters,
  currentCharacterId,
  activePersonaName,
  authorNoteConfig,
  onOpenContextPanel,
}: NavRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const currentCharName = characters.find(c => c.id === currentCharacterId)?.display_name
    || characters.find(c => c.id === currentCharacterId)?.name
    || '选择角色';

  const hasAuthorNote = authorNoteConfig && authorNoteConfig.content && authorNoteConfig.content.trim().length > 0;

  /** 拖拽调整宽度 */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + ev.clientX - startX.current));
      setWidth(next);
    };

    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width]);

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <div
      style={{ width: sidebarWidth, minWidth: collapsed ? COLLAPSED_WIDTH : MIN_WIDTH }}
      className="flex flex-col bg-slate-950/80 border-r border-slate-800/40
        relative transition-all duration-200 ease-out select-none"
    >
      {/* 右边缘：拖拽手柄 + 收缩切换 */}
      {/* 拖拽区域（仅展开时可拖拽调整宽度） */}
      {!collapsed && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 -right-0.5 w-1 h-full cursor-col-resize z-40"
        />
      )}
      {/* 收缩/展开 chevron — 贴在外侧，竖向居中 */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute top-1/2 -translate-y-1/2 -right-[13px] z-50
          w-3 h-10 rounded-r flex items-center justify-center
          bg-slate-950 border border-l-0 border-slate-800/40
          text-slate-600 hover:text-slate-300 cursor-pointer
          transition-colors duration-150"
        title={collapsed ? '展开侧栏' : '收起侧栏'}
      >
        <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {collapsed
            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          }
        </svg>
      </button>

      {collapsed ? (
        /* ── 收缩状态：仅图标 ── */
        <>
          <div className="flex flex-col items-center pt-3 gap-1">
            <button onClick={onNewSession} className={iconBtn} title="新建会话">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            {sessions.length > 0 && (
              <span className="text-[9px] text-slate-600 font-mono">{sessions.length}</span>
            )}
          </div>

          <div className="flex-1" />

          {/* 底部功能图标 */}
          <div className="flex flex-col items-center gap-1 py-2 border-t border-slate-800/40">
            <button onClick={() => onOpenContextPanel('authornote')}
              className={`${iconBtn} relative`} title="Author's Note">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              {hasAuthorNote && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
            <button onClick={() => onOpenContextPanel('persona')}
              className={iconBtn} title={`身份: ${activePersonaName || '未设置'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </button>
            <button onClick={() => onOpenContextPanel('character')}
              className={iconBtn} title={`角色: ${currentCharName}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        /* ── 展开状态 ── */
        <>
          {/* + 按钮 + "New session" 文字标签 */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-1">
            <button onClick={onNewSession} className={iconBtn} title="新建会话">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <span className="text-xs text-slate-500">New session</span>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto scrollbar-lumen pt-1">
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

          {/* 底部功能行 */}
          <div className="border-t border-slate-800/40">
            <button
              onClick={() => onOpenContextPanel('authornote')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-left"
            >
              <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              <span className="text-xs text-slate-400 flex-1">Author's Note</span>
              {hasAuthorNote && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              )}
            </button>

            <button
              onClick={() => onOpenContextPanel('persona')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-left"
            >
              <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="text-xs text-slate-400 flex-1">身份</span>
              <span className="text-[10px] text-slate-600 truncate max-w-20">
                {activePersonaName || '未设置'}
              </span>
            </button>

            <button
              onClick={() => onOpenContextPanel('character')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-left"
            >
              <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-xs text-slate-400 flex-1">角色</span>
              <span className="text-[10px] text-slate-600 truncate max-w-20">
                {currentCharName}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default NavRail;
