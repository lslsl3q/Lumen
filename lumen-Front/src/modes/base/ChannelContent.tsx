// src/modes/base/ChannelContent.tsx
import { useState, useRef, useEffect } from 'react';
import { Send, Hash } from 'lucide-react';
import { useBaseStore } from '../../stores/useBaseStore';
import ChannelMessage from './ChannelMessage';

function ChannelContent() {
  const { channels, activeChannelId, messages, sendMessage } = useBaseStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = messages[activeChannelId] || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [channelMessages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(activeChannelId, text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 频道标题栏 */}
      <div className="h-10 flex items-center gap-2 px-4 border-b border-border-default flex-shrink-0">
        <Hash size={14} className="text-[#555]" />
        <span className="text-sm font-medium text-[#ccc]">{activeChannel?.name}</span>
        {activeChannel?.description && (
          <>
            <span className="text-[#333]">·</span>
            <span className="text-xs text-[#666]">{activeChannel.description}</span>
          </>
        )}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-0.5">
        {channelMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-[#555]">还没有消息，说点什么吧</p>
          </div>
        ) : (
          channelMessages.map((msg) => <ChannelMessage key={msg.id} message={msg} />)
        )}
      </div>

      {/* 输入框 */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface-deep border border-border-default rounded-lg px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`发消息到 #${activeChannel?.name || ''}...`}
            className="flex-1 bg-transparent text-sm text-[#ccc] placeholder-[#555] outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="text-[#555] hover:text-primary disabled:opacity-30
              transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChannelContent;