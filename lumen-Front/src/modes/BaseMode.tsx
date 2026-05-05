// src/modes/BaseMode.tsx
import { useEffect } from 'react';
import ChannelSidebar from './base/ChannelSidebar';
import ChannelContent from './base/ChannelContent';
import InfoPanel from './base/InfoPanel';
import { useBaseStore } from '../stores/useBaseStore';

function BaseMode() {
  const initializeFromBackend = useBaseStore(s => s.initializeFromBackend);

  useEffect(() => {
    initializeFromBackend();
  }, [initializeFromBackend]);

  return (
    <div className="flex h-full w-full bg-[#141413]">
      <ChannelSidebar />
      <ChannelContent />
      <InfoPanel />
    </div>
  );
}

export default BaseMode;
