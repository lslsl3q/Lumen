import { useState } from "react";
import type { WritingAct } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../components/ui/popover";
import { MoreHorizontal, Trash2, Hash } from "lucide-react";
import { ToggleSwitch } from "../../components/ui/toggle-switch";

export function ActHeader({ act, isFirst }: { act: WritingAct; isFirst: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(act.title || "");

  const numerate = !!(act.numerate ?? 1);
  const actNumber = (act.sort_order ?? 0) + 1;

  const handleUpdateNumerate = async (val: boolean) => {
    await useWritingStore.getState().updateActAction(act.id, { numerate: val ? 1 : 0 });
  };

  const handleDelete = async () => {
    await useWritingStore.getState().deleteActAction(act.id);
  };

  const handleTitleBlur = async () => {
    setEditing(false);
    if (title !== (act.title || "")) {
      await useWritingStore.getState().updateActAction(act.id, { title });
    }
  };

  const displayText = title || (numerate ? `Act ${actNumber}` : "Act");

  return (
    <div className={`act-row-header${isFirst ? " is-first" : ""}`}>
      <div className="flex flex-col lg:flex-row lg:gap-6 2xl:gap-8 items-center">
        <div className="flex-1 min-w-0">
          {numerate && (
            <span className="font-medium text-sm opacity-60 text-[var(--color-text-muted)] select-none block text-center">
              Act {actNumber}
            </span>
          )}
          {editing ? (
            <input
              autoFocus
              className="w-full text-center bg-transparent border-b border-[var(--color-border)] px-1 py-0.5 text-base font-semibold text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-dim)]"
              placeholder={numerate ? `Act ${actNumber}` : "Act"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleTitleBlur(); }}
              onBlur={handleTitleBlur}
            />
          ) : (
            <span
              className="text-base font-semibold text-[var(--color-text-muted)] cursor-text select-none hover:text-[var(--color-text-secondary)] transition-colors block text-center"
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
              className="w-44 p-1 bg-[var(--color-surface-deep)] border-[var(--color-border)] rounded-lg shadow-xl"
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-deep)] transition-colors"
                type="button"
                onClick={() => handleUpdateNumerate(!numerate)}
              >
                <Hash className="w-3.5 h-3.5 text-[var(--color-text-dim)]" />
                自动编号
                <ToggleSwitch className="ml-auto" checked={numerate} onChange={(v) => handleUpdateNumerate(v)} />
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded text-[var(--color-error-light)] hover:bg-red-400/10 transition-colors"
                type="button"
                onClick={handleDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除幕
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
