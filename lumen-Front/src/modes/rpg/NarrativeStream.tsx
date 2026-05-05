/**
 * 叙事流主视区 — RPG 消息流渲染
 *
 * 核心布局：垂直滚动的叙事区域，顶部渐隐遮罩，底部输入框。
 * 三种消息样式由 NarrativeMessage 组件处理。
 */
import { useRef, useEffect } from 'react';
import type { Message } from '../../hooks/useChat';
import NarrativeMessage from './NarrativeMessage';

interface NarrativeStreamProps {
  messages: Message[];
  isLoading: boolean;
}

function NarrativeStream({ messages, isLoading }: NarrativeStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息自动滚到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      {/* 顶部渐隐遮罩 */}
      <div className="absolute top-0 left-0 right-0 h-16 z-10 pointer-events-none
        bg-gradient-to-b from-[#141413] to-transparent" />

      {/* 叙事流区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, black 4%, black)',
        }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-3xl opacity-30">⚔</div>
              <p className="text-sm text-slate-600">冒险即将开始...</p>
              <p className="text-xs text-slate-700">在下方输入你的行动</p>
            </div>
          </div>
        ) : (
          <div className="py-6">
            {messages.map((msg, i) => (
              <NarrativeMessage
                key={msg.id}
                message={msg}
                index={i}
                total={messages.length}
              />
            ))}
            {isLoading && (
              <div className="flex justify-center py-4">
                <div className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-pulse [animation-delay:200ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-pulse [animation-delay:400ms]" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NarrativeStream;
