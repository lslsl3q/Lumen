/**
 * WritingEditor — 写作编辑区域 (ManuscriptView 版本)
 *
 * 布局：紧凑工具栏（36px）→ ManuscriptView 手稿视图。
 * View tabs 由 WritingMode 管理，此处不重复。
 */

import { useWritingStore } from "../../stores/useWritingStore";
import { ManuscriptView } from "./ManuscriptView";
import { cn } from "../../lib/utils";
import { Eye, Type } from "lucide-react";

function SaveStatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-1.5 h-1.5 rounded-full flex-shrink-0",
        status === "saved" ? "bg-green-500" :
        status === "saving" ? "bg-yellow-500 animate-pulse" :
        "bg-gray-500"
      )}
      title={status}
    />
  );
}

export function WritingEditor({ children }: { children?: React.ReactNode }) {
  const saveStatus = useWritingStore((s) => s.saveStatus);
  const focusMode = useWritingStore((s) => s.focusMode);
  const typewriterMode = useWritingStore((s) => s.typewriterMode);
  const toggleFocusMode = useWritingStore((s) => s.toggleFocusMode);
  const toggleTypewriterMode = useWritingStore((s) => s.toggleTypewriterMode);

  const acts = useWritingStore((s) => s.acts);
  const totalWords = acts.reduce((sum, act) => {
    return sum + ((act as any).chapters || []).reduce((cSum: number, ch: any) => {
      return cSum + (ch.scenes || []).reduce((sSum: number, sc: any) => sSum + (sc.word_count || 0), 0);
    }, 0);
  }, 0);

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-surface-deep">
      {/* 紧凑工具栏 */}
      <div className="flex items-center justify-end h-9 px-3 bg-surface-deep border-b border-border-default flex-shrink-0 gap-2">
        <span className="text-[11px] text-text-muted tabular-nums">{totalWords} 词</span>
        <SaveStatusDot status={saveStatus} />
        <div className="w-px h-3 bg-border-default mx-0.5" />
        <button
          onClick={toggleFocusMode}
          className={cn("p-1 rounded transition-colors cursor-pointer", focusMode ? "text-primary" : "text-text-muted hover:text-text-secondary")}
          title="专注模式"
          type="button"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggleTypewriterMode}
          className={cn("p-1 rounded transition-colors cursor-pointer", typewriterMode ? "text-primary" : "text-text-muted hover:text-text-secondary")}
          title="打字机模式"
          type="button"
        >
          <Type className="w-3.5 h-3.5" />
        </button>
      </div>
      <ManuscriptView />
      {children}
    </div>
  );
}
