/**
 * RpgMode — 全屏沉浸式 RPG 面板
 *
 * 两栏布局：左侧 RpgStatusPanel 停靠 + 右侧叙事流主视区
 * 进入：BaseMode 点击 RPG 频道
 * 退出：左上角 [← 返回基地] 按钮
 */
import { useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { useModeStore } from '../stores/useModeStore';
import { useRpgMode } from '../hooks/useRpgMode';
import RpgStatusPanel from './rpg/RpgStatusPanel';
import NarrativeStream from './rpg/NarrativeStream';

function RpgMode() {
  const switchMode = useModeStore(s => s.switchMode);
  const { chat, rpg, round, sendAction, abort, exitRpg } = useRpgMode();
  const [input, setInput] = useState('');

  const handleSend = () => {
    const text = input.trim();
    if (!text || chat.isLoading) return;
    setInput('');
    sendAction(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = () => {
    exitRpg();
    switchMode('base');
  };

  return (
    <div className="flex h-full w-full bg-surface-deep">
      {/* 左侧：状态面板 */}
      <RpgStatusPanel
        roomState={rpg.roomState}
      />

      {/* 右侧：叙事流 + 输入区 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* 顶栏：返回 + 频道名 + 回合数 */}
        <div className="h-10 flex items-center gap-3 px-4 border-b border-border-default flex-shrink-0">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-text-muted
              hover:text-text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>返回基地</span>
          </button>
          <div className="w-px h-4 bg-surface-elevated" />
          <span className="text-sm font-medium text-text-secondary">
            冒险
          </span>
          {round > 0 && (
            <>
              <div className="w-px h-4 bg-surface-elevated" />
              <span className="text-xs text-text-muted">
                回合 {round}
              </span>
            </>
          )}
        </div>

        {/* 叙事流 */}
        <NarrativeStream
          messages={chat.messages}
          isLoading={chat.isLoading}
        />

        {/* 输入区 */}
        <div className="px-4 pb-3 pt-2 flex-shrink-0 border-t border-border-default">
          <div className="flex items-center gap-2 bg-surface-deep border border-border-default rounded-lg px-3 py-2
            focus-within:border-primary/25 transition-colors">
            <span className="text-primary text-sm font-mono flex-shrink-0">&gt;</span>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的行动..."
              disabled={chat.isLoading}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim outline-none
                disabled:opacity-50"
            />
            {chat.isLoading ? (
              <button
                onClick={abort}
                className="text-primary hover:text-primary/50 transition-colors
                  text-xs font-medium cursor-pointer"
              >
                停止
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="text-text-dim hover:text-primary disabled:opacity-30
                  transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RpgMode;
