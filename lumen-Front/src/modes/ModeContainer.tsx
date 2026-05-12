// src/modes/ModeContainer.tsx
import { useState, useEffect, useCallback } from 'react';
import { useModeStore } from '../stores/useModeStore';
import { useCharacterStore } from '../stores/useCharacterStore';
import { usePersonaStore } from '../stores/usePersonaStore';
import { useSessionStore } from '../stores/useSessionStore';
import type { useDebugState } from '../hooks/useDebugState';
import type { UseFloatingLayersReturn } from '../components/floating/useFloatingLayers';
import ActivityBar, { type PanelId, type PanelConfig } from '../components/ActivityBar';
import SidePanel from '../components/SidePanel';
import SystemPromptOverlay from '../components/SystemPromptOverlay';
import ChatMode from './ChatMode';
import BaseMode from './BaseMode';
import RpgMode from './RpgMode';
import WritingMode from './WritingMode';

interface ModeContainerProps {
  debug: ReturnType<typeof useDebugState>;
  floating: UseFloatingLayersReturn;
}

/** 各模式的面板配置 */
const MODE_PANELS: Record<string, PanelConfig[]> = {
  chat: [
    { id: 'sessions', title: '会话' },
    { id: 'character', title: '角色' },
    { id: 'persona', title: '身份' },
  ],
  base: [
    { id: 'channels', title: '频道' },
    { id: 'character', title: '角色' },
    { id: 'persona', title: '身份' },
  ],
  writing: [
    { id: 'character', title: '角色' },
  ],
  rpg: [
    { id: 'character', title: '角色' },
    { id: 'persona', title: '身份' },
  ],
};

function ModeContainer({ debug, floating }: ModeContainerProps) {
  const { activeMode, mounted } = useModeStore();
  const [activePanelId, setActivePanelId] = useState<PanelId | null>('sessions');
  const [sysPromptEditor, setSysPromptEditor] = useState<{
    content: string;
    onSave: (c: string) => void;
  } | null>(null);
  const currentCharName = useCharacterStore(s => {
    const c = s.characters.find(ch => ch.id === s.currentCharacterId);
    return c?.display_name || c?.name;
  });

  const panels = MODE_PANELS[activeMode] || MODE_PANELS.chat;

  // 初始化共享 stores
  useEffect(() => {
    useCharacterStore.getState().initialize();
    usePersonaStore.getState().initialize();
    const charId = useCharacterStore.getState().currentCharacterId;
    useSessionStore.getState().initialize(charId);
  }, []);

  // 模式切换时，如果当前面板不在新模式中，重置为该模式的第一个面板
  useEffect(() => {
    if (activePanelId && !panels.some(p => p.id === activePanelId)) {
      setActivePanelId(panels[0]?.id ?? null);
    }
  }, [activeMode, panels, activePanelId]);

  const handlePanelSelect = useCallback((id: PanelId) => {
    setActivePanelId(prev => prev === id ? null : id);
  }, []);

  const handleToggleDebug = useCallback(() => {
    if (!debug.debugMode) {
      debug.toggleDebug();
    }
  }, [debug.debugMode, debug.toggleDebug]);

  return (
    <div className="flex-1 overflow-hidden relative flex">
      {/* 共享 ActivityBar */}
      <ActivityBar
        panels={panels}
        activePanelId={activePanelId}
        onPanelSelect={handlePanelSelect}
        onOpenMemoryWindow={() => window.dispatchEvent(new CustomEvent('lumen:open-knowledge'))}
        onOpenGraphEditor={() => window.dispatchEvent(new CustomEvent('lumen:open-graph'))}
        onManageWorldBooks={() => floating.openSettings('worldbook-list')}
        onToggleDebug={handleToggleDebug}
        onOpenSettings={() => floating.openSettings('config-list')}
      />

      {/* 共享 SidePanel */}
      <SidePanel
        activePanelId={activePanelId}
        onEditSystemPrompt={(content, onSave) => setSysPromptEditor({ content, onSave })}
      />

      {/* 模式内容区 */}
      <div className="flex-1 overflow-hidden relative">
        {mounted.has('chat') && (
          <div className={activeMode === 'chat' ? 'absolute inset-0 flex' : 'hidden'}>
            <ChatMode debug={debug} floating={floating} />
          </div>
        )}
        {mounted.has('base') && (
          <div className={activeMode === 'base' ? 'absolute inset-0 flex' : 'hidden'}>
            <BaseMode />
          </div>
        )}
        {mounted.has('rpg') && (
          <div className={activeMode === 'rpg' ? 'absolute inset-0 flex' : 'hidden'}>
            <RpgMode />
          </div>
        )}
        {mounted.has('writing') && (
          <div className={activeMode === 'writing' ? 'absolute inset-0 flex' : 'hidden'}>
            <WritingMode />
          </div>
        )}
      </div>

      {/* 系统提示词浮动编辑器 */}
      {sysPromptEditor && (
        <SystemPromptOverlay
          initialContent={sysPromptEditor.content}
          characterName={currentCharName}
          onSave={(c) => { sysPromptEditor.onSave(c); setSysPromptEditor(null); }}
          onClose={() => setSysPromptEditor(null)}
        />
      )}
    </div>
  );
}

export default ModeContainer;
