import { useState } from "react";
import type { WritingChapter } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { ToggleSwitch } from "../../components/ui/toggle-switch";
import { Copy, Trash2 } from "lucide-react";
import { ActionsMenu } from "./ActionsMenu";

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

  return (
    <div className={`chapter-row-header${isAfterAct ? " after-act" : ""}`}>
      <div className="manuscript-inner flex flex-col lg:flex-row lg:gap-[var(--gap)] items-center lg:items-start">
        <div className="manuscript-content">
          {showNumber && (
            <span className="font-medium text-sm opacity-60 mb-1 text-[var(--color-text-muted)] select-none block">
              Chapter {chapterNumber}
            </span>
          )}
          <input
            readOnly={!editing}
            className="w-full bg-transparent text-2xl lg:text-3xl font-extrabold outline-none cursor-text transition-colors font-serif"
            style={{ color: editing ? 'var(--color-text-primary)' : 'var(--color-text-muted)', padding: 0, border: 'none' }}
            placeholder={`Chapter ${chapterNumber}: 章节标题…`}
            value={title}
            onFocus={() => setEditing(true)}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onBlur={handleTitleBlur}
          />
        </div>

        <div className="manuscript-side hidden lg:block">
          <ActionsMenu>
            <div className="relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-[var(--color-text-secondary)] outline-hidden select-none">
              自动编号
              <ToggleSwitch className="ml-auto" checked={showNumber} onChange={() => handleUpdateShowNumber(!showNumber)} />
            </div>
            <DropdownMenuItem>
              <Copy className="w-3.5 h-3.5" />
              复制所有正文
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              删除此章节
            </DropdownMenuItem>
          </ActionsMenu>
        </div>
      </div>
    </div>
  );
}
