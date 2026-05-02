/**
 * SystemPromptOverlay — 系统提示词浮动编辑器
 *
 * Portal 到 overlay-root，fixed 定位覆盖 ActivityBar+SidePanel 右侧的聊天区域。
 * 自动跟随窗口大小变化。
 */
import { createPortal } from 'react-dom';
import { useState, useRef, useEffect } from 'react';

interface SystemPromptOverlayProps {
  initialContent: string;
  characterName?: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export default function SystemPromptOverlay({
  initialContent,
  characterName,
  onSave,
  onClose,
}: SystemPromptOverlayProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    onSave(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return createPortal(
    <div
      className="fixed top-0 bottom-0 right-0 z-50 bg-slate-950
        flex flex-col border-l border-slate-800/40 pointer-events-auto
        animate-overlay-fade-in"
      style={{ left: 304 }}
      onKeyDown={handleKeyDown}
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-sm text-slate-300">
            系统提示词
          </span>
          {characterName && (
            <span className="text-xs text-slate-600">— {characterName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">Ctrl+S 保存 · Esc 关闭</span>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1 rounded-md text-xs
              bg-amber-500/15 text-amber-400 border border-amber-500/25
              hover:bg-amber-500/25 transition-colors cursor-pointer
              disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* 编辑区 */}
      <div className="flex-1 p-4 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="你的角色设定、行为准则、说话风格..."
          className="w-full h-full px-4 py-3 rounded-lg text-sm
            bg-slate-900/60 border border-slate-700/40 text-slate-200 placeholder-slate-700
            focus:outline-none focus:border-amber-500/40 resize-none
            font-mono leading-relaxed"
        />
      </div>

      {/* 底部提示 */}
      <div className="px-5 py-2 border-t border-slate-800/40">
        <span className="text-[10px] text-slate-700">
          name 和 description 会自动拼入提示词，不需要在这里重复
        </span>
      </div>
    </div>,
    document.getElementById('overlay-root')!
  );
}
