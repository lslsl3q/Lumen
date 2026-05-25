// src/modes/base/ChannelMessage.tsx
import type { ChannelMessage as ChannelMessageType } from './types';

interface Props {
  message: ChannelMessageType;
}

function ChannelMessage({ message }: Props) {
  if (message.type === 'system') {
    return (
      <div className="px-3 py-1">
        <span className="text-[11px] italic text-text-dim">
          — {message.content} —
        </span>
      </div>
    );
  }

  if (message.type === 'user') {
    return (
      <div className="px-3 py-1.5 hover:bg-[#ffffff04] rounded-md">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-primary">你</span>
          <span className="text-xs text-text-dim">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="text-[13px] text-text-secondary mt-0.5 leading-relaxed">{message.content}</div>
      </div>
    );
  }

  // character message
  return (
    <div className="px-3 py-1.5 hover:bg-[#ffffff04] rounded-md">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold" style={{ color: message.characterColor }}>
          {message.characterName}
        </span>
        <span className="text-[10px] text-text-dim">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="text-[13px] text-text-secondary mt-0.5 leading-relaxed">{message.content}</div>
    </div>
  );
}

export default ChannelMessage;