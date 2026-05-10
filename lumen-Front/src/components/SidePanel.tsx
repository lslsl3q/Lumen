/**
 * SidePanel — 挤出式侧面板（可拖拽调宽）
 *
 * ActivityBar 右侧的 flex 子元素，打开时内容区自然缩小
 * 内容根据 activePanelId 切换：sessions / character / persona / channels
 * 右边缘拖拽手柄调宽，双击恢复默认，宽度存 localStorage
 */
import type { PanelId } from './ActivityBar';
import { useResizableWidth } from '../hooks/useResizableWidth';
import { useSessionStore } from '../stores/useSessionStore';
import { useCharacterStore } from '../stores/useCharacterStore';
import { usePersonaStore } from '../stores/usePersonaStore';
import SessionPanel from './panels/SessionPanel';
import CharacterPanel from './panels/CharacterPanel';
import PersonaPanel from './panels/PersonaPanel';
import ChannelsPanel from './panels/ChannelsPanel';

const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const STORAGE_KEY = 'lumen_sidepanel_width';

interface SidePanelProps {
  activePanelId: PanelId | null;
  onEditSystemPrompt?: (content: string, onSave: (newContent: string) => void) => void;
}

function SidePanel({
  activePanelId,
  onEditSystemPrompt,
}: SidePanelProps) {
  const { width, isDragging, handleMouseDown, handleDoubleClick } = useResizableWidth({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    storageKey: STORAGE_KEY,
  });

  const isOpen = !!activePanelId;

  // 从 stores 获取面板数据
  const sessions = useSessionStore();
  const characters = useCharacterStore();
  const personas = usePersonaStore();

  return (
    <div
      className="flex-shrink-0 overflow-hidden bg-surface-panel relative
        transition-[width] duration-200 ease-out"
      style={{ width: isOpen ? width : 0 }}
    >
      {/* 内层固定宽度，防止内容塌缩 */}
      <div className="h-full flex flex-col relative" style={{ width, minWidth: MIN_WIDTH }}>
        <div key={activePanelId} className="h-full flex flex-col animate-fade-in">
        {activePanelId === 'sessions' && (
          <SessionPanel
            sessions={sessions.sessions}
            currentSessionId={sessions.currentSessionId}
            isLoading={sessions.isLoading}
            onSelectSession={(id) => {
              sessions.switchSession(id);
              window.dispatchEvent(new CustomEvent('lumen:switch-session', { detail: id }));
            }}
            onNewSession={() => sessions.createNewSession(characters.currentCharacterId)}
            onDeleteSession={(id) => sessions.deleteSession(id)}
            onRenameSession={async (sessionId, title) => {
              const { renameSession } = await import('../api/session');
              await renameSession(sessionId, title);
              sessions.refreshSessions();
            }}
            formatLabel={sessions.formatSessionLabel}
            characters={characters.characters}
          />
        )}
        {activePanelId === 'character' && (
          <CharacterPanel
            characters={characters.characters}
            currentCharacterId={characters.currentCharacterId}
            onSwitchCharacter={(id) => {
              characters.setCurrentCharacterId(id);
              window.dispatchEvent(new CustomEvent('lumen:switch-character', { detail: id }));
            }}
            onRefreshCharacters={characters.refreshCharacters}
            onEditSystemPrompt={onEditSystemPrompt}
          />
        )}
        {activePanelId === 'persona' && (
          <PersonaPanel
            personas={personas.personas}
            activePersonaId={personas.activeId}
            onSwitchPersona={personas.switchTo}
            onRefreshPersonas={personas.refresh}
          />
        )}
        {activePanelId === 'channels' && (
          <ChannelsPanel />
        )}

        {/* 拖拽手柄 */}
        {isOpen && (
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            className={`absolute top-0 right-0 bottom-0 w-[3px] cursor-col-resize z-10
              transition-colors duration-100
              ${isDragging
                ? 'bg-primary/40'
                : 'hover:bg-primary/20'
              }`}
            title="拖拽调整宽度 · 双击恢复默认"
          />
        )}
        </div>
      </div>
    </div>
  );
}

export default SidePanel;
