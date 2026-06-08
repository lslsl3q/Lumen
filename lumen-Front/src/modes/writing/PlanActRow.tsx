import { useState, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  SquarePen,
  Trash2,
  MoreVertical,
  Plus,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { ToggleSwitch } from "../../components/ui/toggle-switch";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingAct } from "../../api/writing";
import type { ActDragData } from "./usePlanDrag";

interface PlanActRowProps {
  act: WritingAct;
  children?: React.ReactNode;
}

export function PlanActRow({ act, children }: PlanActRowProps) {
  const [open, setOpen] = useState(true);
  const [title, setTitle] = useState(act.title);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: act.id,
    data: { type: "act", actId: act.id } satisfies ActDragData,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleTitleBlur = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== act.title) {
      useWritingStore.getState().updateActAction(act.id, { title: trimmed });
    } else {
      setTitle(act.title);
    }
  }, [title, act.id, act.title]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      }
      if (e.key === "Escape") {
        setTitle(act.title);
        e.currentTarget.blur();
      }
    },
    [act.title],
  );

  const handleEditInManuscript = useCallback(() => {
    useWritingStore.getState().setManuscriptFilter({ type: "act", id: act.id });
    useWritingStore.getState().setWritingViewTab("write");
  }, [act.id]);

  const handleDeleteAct = useCallback(() => {
    useWritingStore.getState().deleteActAction(act.id);
  }, [act.id]);

  const handleToggleNumerate = useCallback(
    (checked: boolean) => {
      useWritingStore
        .getState()
        .updateActAction(act.id, { numerate: checked ? 1 : 0 });
    },
    [act.id],
  );

  const handleAddChapter = useCallback(() => {
    useWritingStore.getState().createChapter(act.id, "新章节");
  }, [act.id]);

  const chapters = (act as any).chapters || [];
  const totalScenes = chapters.reduce((sum: number, ch: any) => sum + (ch.scenes || []).length, 0);

  // Sync title when act prop changes externally
  if (act.title !== title && document.activeElement?.getAttribute("data-act-title-input") !== act.id) {
    setTitle(act.title);
  }

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, minHeight: 60 }}
        className="flex py-2 items-start rounded bg-zinc-700/30 border border-dashed border-zinc-600/50"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex py-2 items-start rounded"
    >
      {/* Grip handle */}
      <button
        className="flex-none mr-2 flex items-center justify-center h-8 w-6 mt-2 cursor-grab text-zinc-500 hover:text-zinc-300 active:cursor-grabbing transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      {/* Content area */}
      <div className="grow flex flex-col">
        <Collapsible open={open} onOpenChange={setOpen}>
          {/* Header row */}
          <div className="flex py-2 items-center sticky top-0 z-20 bg-[var(--color-surface-deep)]">
            {/* Collapse toggle */}
            <CollapsibleTrigger className="flex items-center justify-center p-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
              {open ? (
                <ChevronDown className="size-5" />
              ) : (
                <ChevronRight className="size-5" />
              )}
            </CollapsibleTrigger>

            {/* Title input */}
            <span className="font-extrabold text-[20px] leading-7 text-zinc-300 opacity-60 mr-0.5 whitespace-nowrap select-none">
              Act {(act.sort_order ?? 0) + 1}:
            </span>
            <input
              data-act-title-input={act.id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="flex-1 bg-transparent text-[20px] font-extrabold leading-7 text-zinc-300 placeholder:text-zinc-600 outline-none border-b-2 border-transparent focus:border-zinc-500 px-1 py-0.5 min-w-0"
              spellCheck={false}
            />

            {/* Stats */}
            <span className="text-[11px] text-zinc-500 tabular-nums mr-3 whitespace-nowrap self-center">
              {chapters.length} 章节 · {totalScenes} 场景
            </span>

            {/* Action buttons */}
            <div className="flex -space-x-px shrink-0">
              <button
                onClick={handleAddChapter}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-l text-[12px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 transition-colors cursor-pointer rounded-r-none"
                title="Add Chapter to Act"
              >
                <Plus className="size-4 opacity-75" />
                New Chapter
              </button>
              <button
                onClick={handleEditInManuscript}
                className="flex items-center justify-center px-1.5 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors cursor-pointer rounded-none"
                title="Edit Act in Manuscript"
              >
                <SquarePen className="size-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center justify-center px-1.5 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors cursor-pointer rounded-r rounded-l-none">
                  <MoreVertical className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleDeleteAct} variant="destructive">
                    <Trash2 className="size-4" />
                    删除卷
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="flex items-center justify-between px-1.5 py-1">
                    <span className="text-sm text-zinc-300">自动编号</span>
                    <ToggleSwitch
                      checked={act.numerate === 1}
                      onChange={handleToggleNumerate}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Collapsible content */}
          <CollapsibleContent>
            <div className="mt-1 mb-2">
              {children}
              {/* Bottom Add Chapter */}
              <button
                onClick={handleAddChapter}
                className="mt-1 inline-flex items-center gap-1 px-1 py-0.5 rounded text-[12px] font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <Plus className="w-[0.85rem] h-[0.85rem] opacity-75" />
                Add Chapter
              </button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
