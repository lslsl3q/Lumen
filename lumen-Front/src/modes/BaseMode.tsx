// src/modes/BaseMode.tsx
import ChannelSidebar from './base/ChannelSidebar';
import ChannelContent from './base/ChannelContent';
import InfoPanel from './base/InfoPanel';

function BaseMode() {
  return (
    <div className="flex h-full w-full bg-[#141413]">
      <ChannelSidebar />
      <ChannelContent />
      <InfoPanel />
    </div>
  );
}

export default BaseMode;
