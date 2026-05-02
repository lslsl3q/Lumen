/**
 * SidePanel — 挤出式侧面板（可拖拽调宽）
 *
 * ActivityBar 右侧的 flex 子元素，打开时 ChatPanel 自然缩小
 * 内容根据 activePanelId 切换：sessions / character / persona
 * 右边缘拖拽手柄调宽，双击恢复默认，宽度存 localStorage
 */
import type { PanelId } from './ActivityBar';
import { useResizableWidth } from '../hooks/useResizableWidth';
import { SessionListItem } from '../types/session';
import { CharacterListItem } from '../types/character';
import { PersonaListItem } from '../types/persona';
import SessionPanel from './panels/SessionPanel';
import CharacterPanel from './panels/CharacterPanel';
import PersonaPanel from './panels/PersonaPanel';

const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const STORAGE_KEY = 'lumen_sidepanel_width';

interface SidePanelProps {
  activePanelId: PanelId | null;
  // Session
  sessions: SessionListItem[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  formatLabel: (sessionId: string) => string;
  characters: CharacterListItem[];
  // Character
  currentCharacterId: string;
  onSwitchCharacter: (characterId: string) => void;
  onRefreshCharacters: () => void;
  onEditSystemPrompt?: (content: string, onSave: (newContent: string) => void) => void;
  // Persona
  personas: PersonaListItem[];
  activePersonaId: string | null;
  onSwitchPersona: (personaId: string | null) => void;
  onRefreshPersonas: () => void;
}

function SidePanel({
  activePanelId,
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
  onSwitchCharacter,
  onRefreshCharacters,
  onEditSystemPrompt,
  personas,
  activePersonaId,
  onSwitchPersona,
  onRefreshPersonas,
}: SidePanelProps) {
  const { width, isDragging, handleMouseDown, handleDoubleClick } = useResizableWidth({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    storageKey: STORAGE_KEY,
  });

  const isOpen = !!activePanelId;

  return (
    <div
      className="flex-shrink-0 overflow-hidden bg-slate-900 relative
        transition-[width] duration-200 ease-out"
      style={{ width: isOpen ? width : 0 }}
    >
      {/* 内层固定宽度，防止内容塌缩 */}
      <div className="h-full flex flex-col relative" style={{ width, minWidth: MIN_WIDTH }}>
        {activePanelId === 'sessions' && (
          <SessionPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoading={isLoading}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            formatLabel={formatLabel}
            characters={characters}
          />
        )}
        {activePanelId === 'character' && (
          <CharacterPanel
            characters={characters}
            currentCharacterId={currentCharacterId}
            onSwitchCharacter={onSwitchCharacter}
            onRefreshCharacters={onRefreshCharacters}
            onEditSystemPrompt={onEditSystemPrompt}
          />
        )}
        {activePanelId === 'persona' && (
          <PersonaPanel
            personas={personas}
            activePersonaId={activePersonaId}
            onSwitchPersona={onSwitchPersona}
            onRefreshPersonas={onRefreshPersonas}
          />
        )}

        {/* 拖拽手柄 */}
        {isOpen && (
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            className={`absolute top-0 right-0 bottom-0 w-[3px] cursor-col-resize z-10
              transition-colors duration-100
              ${isDragging
                ? 'bg-amber-500/40'
                : 'hover:bg-amber-500/20'
              }`}
            title="拖拽调整宽度 · 双击恢复默认"
          />
        )}
      </div>
    </div>
  );
}

export default SidePanel;
