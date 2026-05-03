// src/modes/ModeContainer.tsx
import { useModeStore } from '../stores/useModeStore';
import type { useDebugState } from '../hooks/useDebugState';
import type { UseFloatingLayersReturn } from '../components/floating/useFloatingLayers';
import ChatMode from './ChatMode';
import BaseMode from './BaseMode';
import WritingMode from './WritingMode';

interface ModeContainerProps {
  debug: ReturnType<typeof useDebugState>;
  floating: UseFloatingLayersReturn;
}

function ModeContainer({ debug, floating }: ModeContainerProps) {
  const { activeMode, mounted } = useModeStore();

  return (
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
      {mounted.has('writing') && (
        <div className={activeMode === 'writing' ? 'absolute inset-0 flex' : 'hidden'}>
          <WritingMode />
        </div>
      )}
    </div>
  );
}

export default ModeContainer;
