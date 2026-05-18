/**
 * WritingEditor — 写作编辑区域 (ManuscriptView 版本)
 *
 * 改用 ManuscriptView 多编辑器架构替代单 TipTap Editor 模式。
 * 布局：紧凑工具栏（48px）→ ManuscriptView 手稿视图。
 */

import { useState } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { ManuscriptView } from "./ManuscriptView";
import { ViewTabs, type WritingView } from "./ViewTabs";
import { ChapterSelector } from "./ChapterSelector";
import { FormatPanel } from "./FormatPanel";
import { cn } from "../../lib/utils";
import { Eye, Type } from "lucide-react";

function SaveStatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "saved" ? "bg-green-500" :
        status === "saving" ? "bg-yellow-500 animate-pulse" :
        "bg-gray-500"
      )}
      title={status}
    />
  );
}

function EditorToolbar({
  activeView,
  onViewChange,
  wordCount,
  saveStatus,
  focusMode,
  typewriterMode,
  onToggleFocus,
  onToggleTypewriter,
}: {
  activeView: WritingView;
  onViewChange: (view: WritingView) => void;
  wordCount: number;
  saveStatus: string;
  focusMode: boolean;
  typewriterMode: boolean;
  onToggleFocus: () => void;
  onToggleTypewriter: () => void;
}) {
  return (
    <div className="flex items-center justify-between h-12 px-3 bg-surface-deep border-b border-border-default flex-shrink-0">
      <ViewTabs activeView={activeView} onViewChange={onViewChange} />
      <div className="flex items-center gap-2">
        <ChapterSelector />
        <span className="text-[11px] text-text-muted tabular-nums">{wordCount} 词</span>
        <SaveStatusDot status={saveStatus} />
        <FormatPanel editor={null as any} onToggleFindReplace={() => {}} />
        <div className="w-px h-4 bg-border-default mx-0.5" />
        <button
          onClick={onToggleFocus}
          className={cn("p-1 rounded transition-colors cursor-pointer", focusMode ? "text-primary" : "text-text-muted hover:text-text-secondary")}
          title="专注模式"
          type="button"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleTypewriter}
          className={cn("p-1 rounded transition-colors cursor-pointer", typewriterMode ? "text-primary" : "text-text-muted hover:text-text-secondary")}
          title="打字机模式"
          type="button"
        >
          <Type className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function WritingEditor({ children }: { children?: React.ReactNode }) {
  const saveStatus = useWritingStore((s) => s.saveStatus);
  const focusMode = useWritingStore((s) => s.focusMode);
  const typewriterMode = useWritingStore((s) => s.typewriterMode);
  const toggleFocusMode = useWritingStore((s) => s.toggleFocusMode);
  const toggleTypewriterMode = useWritingStore((s) => s.toggleTypewriterMode);

  const [activeView, setActiveView] = useState<WritingView>("write");

  // Calculate total word count across all scenes
  const acts = useWritingStore((s) => s.acts);
  const totalWords = acts.reduce((sum, act) => {
    return sum + ((act as any).chapters || []).reduce((cSum: number, ch: any) => {
      return cSum + (ch.scenes || []).reduce((sSum: number, sc: any) => sSum + (sc.word_count || 0), 0);
    }, 0);
  }, 0);

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-surface-deep">
      <EditorToolbar
        activeView={activeView}
        onViewChange={setActiveView}
        wordCount={totalWords}
        saveStatus={saveStatus}
        focusMode={focusMode}
        typewriterMode={typewriterMode}
        onToggleFocus={toggleFocusMode}
        onToggleTypewriter={toggleTypewriterMode}
      />
      <ManuscriptView />
      {children}
    </div>
  );
}
