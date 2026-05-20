import { useState, useCallback, useContext } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, ChevronDown, GripVertical, SquarePen, Trash2, MoreVertical } from "lucide-react";
import { DragTypeContext } from "./PlanGridView";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingChapter } from "../../api/writing";

interface PlanChapterRowProps {
  chapter: WritingChapter;
  children?: React.ReactNode;
}

export function PlanChapterRow({ chapter, children }: PlanChapterRowProps) {
  const [title, setTitle] = useState(chapter.title);
  const [open, setOpen] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

  const activeDragType = useContext(DragTypeContext);
  const shouldAnimate = !activeDragType || activeDragType === "chapter";

  const style: React.CSSProperties = {
    transform: shouldAnimate ? CSS.Transform.toString(transform) : undefined,
    transition: shouldAnimate ? transition : undefined,
    opacity: isDragging ? 0 : 1,
  };

  const chapterNumber = (chapter.sort_order ?? 0) + 1;

  const handleTitleBlur = useCallback(() => {
    if (title !== chapter.title) {
      useWritingStore.getState().updateChapterAction(chapter.id, { title });
    }
  }, [title, chapter.id, chapter.title]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      }
    },
    [],
  );

  const handleEditInManuscript = useCallback(() => {
    useWritingStore.getState().setManuscriptFilter({
      type: "chapter",
      id: chapter.id,
    });
    useWritingStore.getState().setWritingViewTab("write");
  }, [chapter.id]);

  const handleDelete = useCallback(() => {
    useWritingStore.getState().deleteChapterAction(chapter.id);
  }, [chapter.id]);

  return (
    <div ref={setNodeRef} style={style}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center">
          {/* Grip handle — same size as scene */}
          <button
            {...attributes}
            {...listeners}
            className="flex-none cursor-grab text-zinc-500 hover:text-zinc-300 shrink-0"
            type="button"
          >
            <GripVertical size={14} />
          </button>

          <CollapsibleTrigger className="flex items-center justify-center p-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </CollapsibleTrigger>

          <div className="flex flex-col leading-none grow">
            <div className="flex items-center grow">
              <span className="opacity-50 text-xs font-medium text-zinc-300">
                第{chapterNumber}章
              </span>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="text-[16px] font-semibold bg-transparent text-zinc-300 placeholder:text-zinc-600 outline-none min-w-0"
              placeholder="章节标题..."
            />
          </div>

          {/* Action buttons — in main row, vertically centered with grip & triangle */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity">
            <button
              onClick={handleEditInManuscript}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer"
              title="在编辑器中打开"
              type="button"
            >
              <SquarePen size={14} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer"
                type="button"
              >
                <MoreVertical size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleEditInManuscript}>
                  <SquarePen size={14} />
                  在编辑器中打开
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} variant="destructive">
                  <Trash2 size={14} />
                  删除章节
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CollapsibleContent>
          <div className="flex flex-col">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
