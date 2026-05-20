import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
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
} from "../../components/ui/dropdown-menu";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingScene } from "../../api/writing";
import {
  type DragData,
  type SceneDragData,
  type ChapterDragData,
  type ActDragData,
  buildSceneChapterMap,
  buildChapterActMap,
  handleSceneDrag,
  handleChapterDrag,
  handleActDrag,
  filterActs,
} from "./usePlanDrag";

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// ── Draggable Scene Card ──

function KanbanSceneCard({ scene }: { scene: WritingScene }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: scene.id,
    data: {
      type: "scene",
      sceneId: scene.id,
      chapterId: scene.chapter_id,
    } satisfies SceneDragData,
  });

  const [summary, setSummary] = useState(scene.summary || "");

  const handleBlur = useCallback(() => {
    if (summary !== (scene.summary || "")) {
      useWritingStore.getState().updateSceneAction(scene.id, { summary });
    }
  }, [summary, scene.id, scene.summary]);

  const handleOpen = useCallback(() => {
    useWritingStore.getState().setActiveScene(scene.id);
    useWritingStore.getState().setWritingViewTab("write");
  }, [scene.id]);

  const handleDelete = useCallback(async () => {
    await useWritingStore.getState().deleteSceneAction(scene.id);
  }, [scene.id]);

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className="rounded bg-zinc-900 border border-zinc-600/50 shadow-sm flex min-w-0"
    >
      <div className="grow flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-700/50">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-zinc-500 hover:text-zinc-300 transition-colors"
            type="button"
          >
            <GripVertical size={12} />
          </button>
          <span className="text-[11px] text-zinc-500 font-medium">
            Scene {(scene.sort_order ?? 0) + 1}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={handleOpen}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
              title="在编辑器中打开"
              type="button"
            >
              <SquarePen size={12} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer">
                <MoreVertical size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                  <Trash2 className="w-3 h-3" />
                  删除场景
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <textarea
          className="flex-1 min-h-[40px] text-[12px] leading-[18px] text-zinc-400 resize-none outline-none bg-transparent border-none p-2 placeholder:text-zinc-600"
          placeholder="场景摘要…"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onFocus={(e) => autoResize(e.currentTarget)}
          onInput={(e) => autoResize(e.currentTarget as HTMLTextAreaElement)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
          rows={1}
        />
      </div>
    </div>
  );
}

// ── Draggable + Droppable Chapter Card ──

function KanbanChapterCard({ chapter }: { chapter: any }) {
  const scenes: WritingScene[] = chapter.scenes || [];
  const createScene = useWritingStore((s) => s.createScene);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: chapter.id,
    data: { type: "chapter" },
  });

  const { attributes: chAttrs, listeners: chListeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: chapter.id,
    data: {
      type: "chapter",
      chapterId: chapter.id,
      actId: chapter.act_id,
    } satisfies ChapterDragData,
  });

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  }, [setDropRef, setDragRef]);

  const [title, setTitle] = useState(chapter.title || "");
  const chapterNum = (chapter.sort_order ?? 0) + 1;

  const handleTitleBlur = useCallback(() => {
    if (title !== chapter.title) {
      useWritingStore.getState().updateChapterAction(chapter.id, { title });
    }
  }, [title, chapter.id, chapter.title]);

  const handleOpen = useCallback(() => {
    useWritingStore.getState().setManuscriptFilter({ type: "chapter", id: chapter.id });
    useWritingStore.getState().setWritingViewTab("write");
  }, [chapter.id]);

  const handleDelete = useCallback(() => {
    useWritingStore.getState().deleteChapterAction(chapter.id);
  }, [chapter.id]);

  const wordCount = scenes.reduce((sum: number, sc: any) => sum + (sc.word_count || 0), 0);

  return (
    <div
      ref={setRefs}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`w-80 rounded-md bg-zinc-800 text-sm flex flex-col flex-none transition-colors ${isOver ? "ring-1 ring-zinc-500" : ""}`}
    >
      <div className="flex border-b border-zinc-700 px-2 py-1.5">
        <button
          {...chAttrs}
          {...chListeners}
          className="cursor-grab text-zinc-500 hover:text-zinc-300 transition-colors self-center"
          type="button"
        >
          <GripVertical size={12} />
        </button>
        <span className="text-[11px] text-zinc-500 self-center whitespace-nowrap ml-1">
          Ch {chapterNum}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-zinc-300 placeholder:text-zinc-600 outline-none px-1"
          placeholder="章节标题..."
        />
        <span className="text-[10px] text-zinc-500 self-center tabular-nums whitespace-nowrap">
          {wordCount} 词
        </span>
        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={handleOpen}
            className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            title="在编辑器中打开"
            type="button"
          >
            <SquarePen size={12} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer">
              <MoreVertical size={12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-3 h-3" />
                删除章节
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grow p-2 flex flex-col gap-2">
        {scenes.map((sc) => (
          <KanbanSceneCard key={sc.id} scene={sc} />
        ))}
        <button
          type="button"
          onClick={() => createScene(chapter.id)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors cursor-pointer self-start"
        >
          <Plus className="w-3 h-3" />
          New Scene
        </button>
      </div>
    </div>
  );
}

// ── Draggable + Droppable Act Section ──

function KanbanActSection({ act }: { act: any }) {
  const [open, setOpen] = useState(true);
  const [title, setTitle] = useState(act.title || "");
  const createChapter = useWritingStore((s) => s.createChapter);

  const chapters = (act.chapters || []) as any[];
  const totalWords = chapters.reduce(
    (sum, ch) => sum + (ch.scenes || []).reduce((s: number, sc: any) => s + (sc.word_count || 0), 0),
    0,
  );

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: act.id,
    data: { type: "act" },
  });

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: act.id,
    data: { type: "act", actId: act.id } satisfies ActDragData,
  });

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  }, [setDropRef, setDragRef]);

  const handleTitleBlur = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== act.title) {
      useWritingStore.getState().updateActAction(act.id, { title: trimmed });
    } else {
      setTitle(act.title);
    }
  }, [title, act.id, act.title]);

  const handleEditInManuscript = useCallback(() => {
    useWritingStore.getState().setManuscriptFilter({ type: "act", id: act.id });
    useWritingStore.getState().setWritingViewTab("write");
  }, [act.id]);

  const handleDeleteAct = useCallback(() => {
    useWritingStore.getState().deleteActAction(act.id);
  }, [act.id]);

  return (
    <div
      ref={setRefs}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`rounded-lg transition-colors ${isOver ? "ring-1 ring-zinc-500/50" : ""}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="sticky top-0 z-20 bg-[var(--color-surface-deep)] py-2">
          {/* Row 1: Title */}
          <div className="flex items-center">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 ml-1 mr-0.5"
              type="button"
            >
              <GripVertical className="size-5" />
            </button>
            <CollapsibleTrigger className="flex items-center justify-center p-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
              {open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
            </CollapsibleTrigger>
            <span className="font-extrabold text-[20px] leading-7 text-zinc-300 opacity-60 mr-0.5 select-none">
              Act {(act.sort_order ?? 0) + 1}:
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setTitle(act.title); e.currentTarget.blur(); }
              }}
              className="flex-1 bg-transparent text-[20px] font-extrabold leading-7 text-zinc-300 placeholder:text-zinc-600 outline-none border-b-2 border-transparent focus:border-zinc-500 px-1 py-0.5 min-w-0"
              spellCheck={false}
            />
          </div>
          {/* Row 2: Button group + Stats, aligned with chevron */}
          <div className="flex items-center gap-3 mt-1 pl-[28px]">
            <div className="flex -space-x-px shrink-0">
              <button
                onClick={() => createChapter(act.id, "新章节")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-l text-[12px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 transition-colors cursor-pointer rounded-r-none"
              >
                <Plus className="size-4 opacity-75" />
                New Chapter
              </button>
              <button
                onClick={handleEditInManuscript}
                className="flex items-center justify-center px-1.5 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors cursor-pointer rounded-none"
                title="在编辑器中打开"
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex-1" />
            <span className="text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
              {chapters.length} 章节 · {totalWords} 词
            </span>
          </div>
        </div>

        <CollapsibleContent>
          <div className="flex flex-wrap gap-2 mt-1 mb-3 pl-[28px]">
            {chapters.map((ch) => (
              <KanbanChapterCard key={ch.id} chapter={ch} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ── Main Kanban View ──

export function PlanKanbanView({ searchQuery }: { searchQuery: string }) {
  const acts = useWritingStore((s) => s.acts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"act" | "chapter" | "scene" | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const sceneChapterMap = useMemo(() => buildSceneChapterMap(acts as any[]), [acts]);
  const chapterActMap = useMemo(() => buildChapterActMap(acts as any[]), [acts]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    setActiveType(data.type);
    if (data.type === "act") setActiveId(data.actId);
    else if (data.type === "chapter") setActiveId(data.chapterId);
    else if (data.type === "scene") setActiveId(data.sceneId);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      setActiveType(null);

      const { active, over } = event;
      if (!over) return;

      const data = active.data.current as DragData | undefined;
      if (!data) return;

      const overData = over.data.current as { type?: string } | undefined;
      const overType = overData?.type;
      const overId = String(over.id);

      try {
        if (data.type === "scene") {
          await handleSceneDrag(data.sceneId, overId, overType, sceneChapterMap, acts);
        } else if (data.type === "chapter") {
          await handleChapterDrag(data.chapterId, overId, overType, chapterActMap, acts);
        } else if (data.type === "act") {
          await handleActDrag(data.actId, overId, acts);
        }
      } catch (err) {
        console.error("[Kanban] dragEnd failed:", err);
      }
    },
    [sceneChapterMap, chapterActMap, acts],
  );

  const filteredActs = useMemo(() => filterActs(acts as any[], searchQuery), [acts, searchQuery]);

  // DragOverlay data
  const activeItem = useMemo(() => {
    if (!activeId || !activeType) return null;
    for (const act of filteredActs) {
      if (activeType === "act" && act.id === activeId)
        return { label: act.title || "卷" };
      for (const ch of (act as any).chapters || []) {
        if (activeType === "chapter" && ch.id === activeId)
          return { label: ch.title || "章节" };
        for (const sc of ch.scenes || []) {
          if (activeType === "scene" && sc.id === activeId)
            return { label: sc.summary || "场景" };
        }
      }
    }
    return null;
  }, [activeId, activeType, filteredActs]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4">
        {filteredActs.map((act) => (
          <KanbanActSection key={act.id} act={act} />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem && activeType === "scene" && (
          <div className="opacity-70 bg-zinc-900/90 rounded border border-zinc-600 p-2 text-[12px] text-zinc-300 shadow-lg max-w-xs">
            {activeItem.label}
          </div>
        )}
        {activeItem && activeType === "chapter" && (
          <div className="opacity-70 bg-zinc-800/90 rounded-md border border-zinc-600 p-2 text-[13px] font-semibold text-zinc-300 shadow-lg w-60">
            {activeItem.label}
          </div>
        )}
        {activeItem && activeType === "act" && (
          <div className="opacity-70 bg-zinc-800/90 rounded-lg border border-zinc-500 p-3 text-[16px] font-extrabold text-zinc-300 shadow-lg">
            {activeItem.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
