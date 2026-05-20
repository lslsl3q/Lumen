import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import { PlanActRow } from "./PlanActRow";
import { PlanChapterRow } from "./PlanChapterRow";
import { PlanSceneRow } from "./PlanSceneRow";
import {
  type DragData,
  buildSceneChapterMap,
  buildChapterActMap,
  handleSceneDrag,
  handleChapterDrag,
  handleActDrag,
  filterActs,
} from "./usePlanDrag";

export function PlanGridView({ searchQuery }: { searchQuery: string }) {
  const acts = useWritingStore((s) => s.acts);
  const createScene = useWritingStore((s) => s.createScene);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"act" | "chapter" | "scene" | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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
        console.error("[PlanGrid] dragEnd failed:", err);
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
      <div className="flex flex-col gap-3 items-stretch">
        {filteredActs.map((act) => {
          const chapters = (act as any).chapters || [];
          return (
            <PlanActRow key={act.id} act={act}>
              {chapters.map((ch: any) => {
                const scenes = ch.scenes || [];
                return (
                  <PlanChapterRow key={ch.id} chapter={ch}>
                    {scenes.map((sc: any) => (
                      <PlanSceneRow key={sc.id} scene={sc} />
                    ))}
                    <button
                      type="button"
                      onClick={() => createScene(ch.id)}
                      className="ml-5 self-start inline-flex items-center gap-1 px-1 py-0.5 rounded text-[12px] font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <Plus className="w-[0.85rem] h-[0.85rem] opacity-75" />
                      Add Scene
                    </button>
                  </PlanChapterRow>
                );
              })}
            </PlanActRow>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem && activeType === "scene" && (
          <div className="opacity-70 bg-zinc-800/90 rounded border border-zinc-600 p-2 text-[14px] text-zinc-300 shadow-lg max-w-md truncate">
            {activeItem.label}
          </div>
        )}
        {activeItem && activeType === "chapter" && (
          <div className="opacity-70 bg-zinc-800/90 rounded border border-zinc-600 px-3 py-1.5 text-[16px] font-semibold text-zinc-300 shadow-lg">
            {activeItem.label}
          </div>
        )}
        {activeItem && activeType === "act" && (
          <div className="opacity-70 bg-zinc-800/90 rounded border border-zinc-600 px-3 py-2 text-[20px] font-extrabold text-zinc-300 shadow-lg">
            {activeItem.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
