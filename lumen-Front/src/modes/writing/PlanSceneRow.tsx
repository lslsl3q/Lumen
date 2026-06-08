import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

/** 获取场景显示文本：优先摘要，无摘要时截取正文前3行 */
function getSceneDisplayText(scene: WritingScene): { text: string; isEditable: boolean } {
  const summaryText = extractDocText(scene.summary || "");
  if (summaryText) {
    return { text: summaryText, isEditable: true };
  }
  const contentText = extractDocText(scene.content || "");
  if (contentText) {
    const lines = contentText.split('\n').filter(l => l.trim());
    const displayLines = lines.slice(0, 3);
    const truncated = displayLines.join('\n') + (lines.length > 3 ? '...' : '');
    return { text: truncated, isEditable: false };
  }
  return { text: "场景摘要…", isEditable: false };
}

interface PlanSceneRowProps {
  scene: WritingScene;
}

export function PlanSceneRow({ scene }: PlanSceneRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayInfo = getSceneDisplayText(scene);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
    data: {
      type: "scene",
      sceneId: scene.id,
      chapterId: scene.chapter_id,
    } satisfies SceneDragData,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSummaryBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (!displayInfo.isEditable) return;
      const text = e.currentTarget.value;
      const json = wrapAsDoc(text);
      if (json !== (scene.summary || "")) {
        useWritingStore.getState().patchScene(scene.id, { summary: json });
      }
    },
    [scene.id, scene.summary, displayInfo.isEditable],
  );

  const handleOpenInManuscript = useCallback(() => {
    useWritingStore.getState().setActiveScene(scene.id);
    useWritingStore.getState().setWritingViewTab("write");
  }, [scene.id]);

  const handleDelete = useCallback(async () => {
    await useWritingStore.getState().deleteSceneAction(scene.id);
  }, [scene.id]);

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, minHeight: 56 + 8 + 2 }}
        className="flex gap-1 items-center py-0.5 rounded bg-zinc-700/30 border border-dashed border-zinc-600/50"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-1 items-center py-0.5 rounded"
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
          className={`flex-1 min-h-[56px] text-[14px] leading-[22.75px] resize-none outline-none bg-transparent border-none p-2 ${
            displayInfo.isEditable ? "font-normal text-zinc-300" : "font-medium text-zinc-600"
          }`}
          placeholder="场景摘要…"
          defaultValue={displayInfo.text}
          rows={2}
          readOnly={!displayInfo.isEditable}
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
