import { useRef, useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, SquarePen, Trash2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingScene } from "../../api/writing";
import type { SceneDragData } from "./usePlanDrag";
import { extractDocText, wrapAsDoc } from "../../lib/tiptap";

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

interface PlanSceneRowProps {
  scene: WritingScene;
}

export function PlanSceneRow({ scene }: PlanSceneRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: scene.id,
    data: { type: "scene" },
  });

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: scene.id,
    data: {
      type: "scene",
      sceneId: scene.id,
      chapterId: scene.chapter_id,
    } satisfies SceneDragData,
  });

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  }, [setDropRef, setDragRef]);

  const handleSummaryBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const text = e.currentTarget.value;
      const json = wrapAsDoc(text);
      if (json !== (scene.summary || "")) {
        useWritingStore.getState().patchScene(scene.id, { summary: json });
      }
    },
    [scene.id, scene.summary],
  );

  const handleOpenInManuscript = useCallback(() => {
    useWritingStore.getState().setActiveScene(scene.id);
    useWritingStore.getState().setWritingViewTab("write");
  }, [scene.id]);

  const handleDelete = useCallback(async () => {
    await useWritingStore.getState().deleteSceneAction(scene.id);
  }, [scene.id]);

  return (
    <div
      ref={setRefs}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`flex gap-1 items-center py-0.5 rounded transition-colors ${isOver ? "bg-zinc-700/30" : ""}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="flex-none cursor-grab text-zinc-500 hover:text-zinc-300 transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>

      {/* Scene editor with border */}
      <div className="grow flex flex-col border border-zinc-400/40 shadow-sm rounded focus-within:ring-1 focus-within:ring-zinc-600 focus-within:border-zinc-600">
        <textarea
          ref={textareaRef}
          className="flex-1 min-h-[56px] text-[14px] leading-[22.75px] font-normal text-zinc-300 resize-none outline-none bg-transparent border-none p-2 placeholder:text-zinc-600"
          placeholder="场景摘要…"
          defaultValue={extractDocText(scene.summary || "")}
          rows={2}
          onFocus={(e) => autoResize(e.currentTarget)}
          onInput={(e) => autoResize(e.currentTarget as HTMLTextAreaElement)}
          onBlur={handleSummaryBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0 flex flex-col-reverse items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          title="在编辑器中打开"
          onClick={handleOpenInManuscript}
        >
          <SquarePen className="w-3.5 h-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              删除场景
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
