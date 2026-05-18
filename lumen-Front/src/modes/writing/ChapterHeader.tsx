import { useState } from "react";
import type { WritingChapter } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../components/ui/popover";
import { MoreHorizontal, Hash, Copy, Trash2 } from "lucide-react";
import { ToggleSwitch } from "../../components/ui/toggle-switch";

export function ChapterHeader({
  chapter,
  isAfterAct,
}: {
  chapter: WritingChapter;
  isAfterAct: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chapter.title || "");

  const showNumber = !!(chapter.show_number ?? 1);
  const chapterNumber = (chapter.sort_order ?? 0) + 1;

  const handleUpdateShowNumber = async (val: boolean) => {
    await useWritingStore.getState().updateChapterAction(chapter.id, { show_number: val ? 1 : 0 });
  };

  const handleDelete = async () => {
    await useWritingStore.getState().deleteChapterAction(chapter.id);
  };

  const handleTitleBlur = async () => {
    setEditing(false);
    if (title !== (chapter.title || "")) {
      await useWritingStore.getState().updateChapterAction(chapter.id, { title });
    }
  };

  const displayText = title || `Chapter ${chapterNumber}: 章节标题…`;

  return (
    <div className={`chapter-row-header${isAfterAct ? " after-act" : ""}`}>
      <div className="manuscript-inner flex flex-col lg:flex-row lg:gap-6 2xl:gap-8 items-center lg:items-start">
        <div className="flex-1 min-w-0">
          {showNumber && (
            <span className="font-medium text-sm opacity-60 mb-1 text-[var(--color-text-muted)] select-none block">
              Chapter {chapterNumber}
            </span>
          )}
          {editing ? (
            <input
              autoFocus
              className="w-full bg-transparent border-b border-[var(--color-border)] px-1 py-0.5 text-2xl lg:text-3xl font-extrabold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)] font-serif"
              placeholder={`Chapter ${chapterNumber}: 章节标题…`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleTitleBlur(); }}
              onBlur={handleTitleBlur}
            />
          ) : (
            <span
              className="text-2xl lg:text-3xl font-extrabold text-[var(--color-text-muted)] cursor-text select-none font-serif block"
              onClick={() => setEditing(true)}
            >
              {displayText}
            </span>
          )}
        </div>

        <div className="w-64 2xl:w-80 shrink-0 hidden lg:block">
          <Popover>
            <PopoverTrigger
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
              type="button"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              Actions
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-48 p-1 bg-[var(--color-surface-deep)] border-[var(--color-border)] rounded-lg shadow-xl"
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-deep)] transition-colors"
                type="button"
                onClick={() => handleUpdateShowNumber(!showNumber)}
              >
                <Hash className="w-3.5 h-3.5 text-[var(--color-text-dim)]" />
                自动编号
                <ToggleSwitch className="ml-auto" checked={showNumber} onChange={(v) => handleUpdateShowNumber(v)} />
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-deep)] transition-colors"
                type="button"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--color-text-dim)]" />
                复制所有正文
              </button>
              <div className="h-px bg-[var(--color-border)] my-1" />
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded text-[var(--color-error-light)] hover:bg-red-400/10 transition-colors"
                type="button"
                onClick={handleDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除此章节
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
