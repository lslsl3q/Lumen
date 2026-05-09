// src/modes/ChatMode.tsx
import { useChatMode } from '../hooks/useChatMode';
import type { useDebugState } from '../hooks/useDebugState';
import type { UseFloatingLayersReturn } from '../components/floating/useFloatingLayers';
import ChatPanel from '../components/ChatPanel';
import SystemPromptOverlay from '../components/SystemPromptOverlay';
import MemoryWindow from '../components/MemoryWindow';
import GraphWindow from '../components/GraphWindow';
import RpgPanel from '../components/RpgPanel';

interface ChatModeProps {
  debug: ReturnType<typeof useDebugState>;
  floating: UseFloatingLayersReturn;
}

function ChatMode({ debug, floating }: ChatModeProps) {
  const d = useChatMode({ debug, floating });

  return (
    <div className="flex h-full w-full">
      <ChatPanel
        messages={d.chat.messages}
        isLoading={d.chat.isLoading}
        input={d.chat.input}
        error={d.chat.error}
        sessionId={d.sessions.currentSessionId}
        tokenUsage={d.tokenUsage}
        onInputChange={d.chat.setInput}
        onSendMessage={d.handleSendMessage}
        onCommandResult={d.handleCommandResult}
        onAbort={d.chat.abort}
        onCompact={d.handleCompact}
        onOpenMonitor={d.handleToggleDebug}
        characterName={d.characters.currentCharacter?.display_name || d.characters.currentCharacter?.name}
        characterAvatar={d.characters.currentCharacter?.avatar}
        currentModel={d.currentModel}
        onModelChange={d.setCurrentModel}
        onEditMessage={d.chat.editMessage}
        onDeleteMessage={d.chat.deleteMessage}
        onRegenerateMessage={d.handleRegenerate}
        onBranchFromMessage={d.handleBranch}
        responseStyle={d.chat.responseStyle}
        onResponseStyleChange={d.chat.setResponseStyle}
        authorNoteConfig={d.authorNote.config}
        onAuthorNoteSaveContent={d.authorNote.saveContent}
        onAuthorNoteSetPosition={d.authorNote.setPosition}
      />

      {/* 浮窗 */}
      {d.sysPromptEditor && (
        <SystemPromptOverlay
          initialContent={d.sysPromptEditor.content}
          characterName={d.characters.currentCharacter?.display_name || d.characters.currentCharacter?.name}
          onSave={(c) => { d.sysPromptEditor?.onSave(c); d.setSysPromptEditor(null); }}
          onClose={() => d.setSysPromptEditor(null)}
        />
      )}
      {d.memoryWindowOpen && (
        <MemoryWindow
          open
          onClose={() => d.setMemoryWindowOpen(false)}
        />
      )}
      {d.graphWindowOpen && (
        <GraphWindow
          open
          onClose={() => d.setGraphWindowOpen(false)}
        />
      )}
      {d.rpgPanelOpen && d.rpg.roomState.roomId && (
        <RpgPanel
          roomState={d.rpg.roomState}
          playerId={d.characters.currentCharacterId}
          onClose={() => d.setRpgPanelOpen(false)}
        />
      )}
    </div>
  );
}

export default ChatMode;
