import { useCallback, useMemo, useState, createContext } from "react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import * as writingApi from "../../api/writing";
import { PlanActRow } from "./PlanActRow";
import { PlanChapterRow } from "./PlanChapterRow";
import { PlanSceneRow } from "./PlanSceneRow";

type ItemType = "act" | "chapter" | "scene";

/** What type is currently being dragged — row components use this to skip cross-type transforms */
export const DragTypeContext = createContext<ItemType | null>(null);

function buildTypeMap(
  acts: any[]
): Map<string, { type: ItemType; parentId: string }> {
  const map = new Map<string, { type: ItemType; parentId: string }>();
  for (const act of acts) {
    map.set(act.id, { type: "act", parentId: act.project_id });
    for (const ch of act.chapters || []) {
      map.set(ch.id, { type: "chapter", parentId: act.id });
      for (const sc of ch.scenes || []) {
        map.set(sc.id, { type: "scene", parentId: ch.id });
      }
    }
  }
  return map;
}

export function PlanGridView({ searchQuery }: { searchQuery: string }) {
  const acts = useWritingStore((s) => s.acts);
  const createScene = useWritingStore((s) => s.createScene);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const typeMap = useMemo(() => buildTypeMap(acts as any[]), [acts]);

  // Only collide with items of the same type (scene↔scene, chapter↔chapter, act↔act)
  const collisionDetection = useCallback(
    (args: any) => {
      const activeInfo = typeMap.get(String(args.active.id));
      if (!activeInfo) return [];

      const sameType = args.droppableContainers.filter((c: any) => {
        const info = typeMap.get(String(c.id));
        return info?.type === activeInfo.type;
      });

      return sameType.length === 0
        ? []
        : closestCenter({ ...args, droppableContainers: sameType });
    },
    [typeMap]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const aId = String(active.id);
      const oId = String(over.id);
      const store = useWritingStore.getState();
      const aInfo = typeMap.get(aId);
      const oInfo = typeMap.get(oId);

      console.log("[PlanGrid] dragEnd", { aId, aType: aInfo?.type, oId, oType: oInfo?.type });

      if (!aInfo || !oInfo || aInfo.type !== oInfo.type) return;

      try {
      if (aInfo.type === "scene") {
        let srcChId: string | null = null;
        let tgtChId: string | null = null;
        let tgtIds: string[] = [];

        for (const act of store.acts) {
          for (const ch of (act as any).chapters || []) {
            const ids = ((ch.scenes || []) as any[]).map(
              (s) => s.id
            ) as string[];
            if (ids.includes(aId)) srcChId = ch.id;
            if (ids.includes(oId)) {
              tgtChId = ch.id;
              tgtIds = [...ids];
            }
          }
        }

        if (!tgtChId) return;

        if (srcChId === tgtChId) {
          await store.reorderScenesAction(
            tgtChId,
            arrayMove(tgtIds, tgtIds.indexOf(aId), tgtIds.indexOf(oId))
          );
        } else {
          await writingApi.updateScene(aId, { chapter_id: tgtChId });
          tgtIds.splice(tgtIds.indexOf(oId), 0, aId);
          await writingApi.reorderScenes(tgtChId, tgtIds);
          if (store.activeProjectId)
            await store.loadManuscript(store.activeProjectId);
        }
      } else if (aInfo.type === "chapter") {
        let srcActId: string | null = null;
        let tgtActId: string | null = null;
        let tgtIds: string[] = [];

        for (const act of store.acts) {
          const ids = ((act as any).chapters || []).map(
            (ch: any) => ch.id
          ) as string[];
          if (ids.includes(aId)) srcActId = act.id;
          if (ids.includes(oId)) {
            tgtActId = act.id;
            tgtIds = [...ids];
          }
        }

        if (!tgtActId) return;

        if (srcActId === tgtActId) {
          await store.reorderChaptersAction(
            tgtActId,
            arrayMove(tgtIds, tgtIds.indexOf(aId), tgtIds.indexOf(oId))
          );
        } else {
          await writingApi.updateChapter(aId, { act_id: tgtActId });
          tgtIds.splice(tgtIds.indexOf(oId), 0, aId);
          await writingApi.reorderChapters(tgtActId, tgtIds);
          if (store.activeProjectId)
            await store.loadManuscript(store.activeProjectId);
        }
      } else if (aInfo.type === "act") {
        const actIds = store.acts.map((a) => a.id);
        if (actIds.includes(aId) && actIds.includes(oId) && store.activeProjectId) {
          await store.reorderActsAction(
            store.activeProjectId,
            arrayMove(actIds, actIds.indexOf(aId), actIds.indexOf(oId))
          );
        }
      }
      } catch (err) {
        console.error("[PlanGrid] dragEnd failed:", err);
      }
    },
    [typeMap]
  );

  const q = searchQuery.toLowerCase().trim();

  const filteredActs = q
    ? acts.filter((act) => {
        const actTitle = (act.title || "").toLowerCase();
        const chapters = (act as any).chapters || [];
        if (actTitle.includes(q)) return true;
        return chapters.some((ch: any) => {
          if ((ch.title || "").toLowerCase().includes(q)) return true;
          return (ch.scenes || []).some((sc: any) =>
            ((sc.summary || "") + (sc.subtitle || "")).toLowerCase().includes(q)
          );
        });
      })
    : acts;

  const allSortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const act of filteredActs) {
      ids.push(act.id);
      const chapters = (act as any).chapters || [];
      for (const ch of chapters) {
        ids.push(ch.id);
        const scenes: any[] = ch.scenes || [];
        for (const sc of scenes) {
          ids.push(sc.id);
        }
      }
    }
    return ids;
  }, [filteredActs]);

  // DragOverlay data
  const activeItem = useMemo(() => {
    if (!activeId) return null;
    for (const act of filteredActs) {
      if (act.id === activeId)
        return { type: "act" as const, label: act.title || "卷" };
      for (const ch of (act as any).chapters || []) {
        if (ch.id === activeId)
          return { type: "chapter" as const, label: ch.title || "章节" };
        for (const sc of ch.scenes || []) {
          if (sc.id === activeId)
            return { type: "scene" as const, label: sc.summary || "场景" };
        }
      }
    }
    return null;
  }, [activeId, filteredActs]);

  const activeDragType = activeId ? typeMap.get(activeId)?.type ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <DragTypeContext.Provider value={activeDragType}>
      <SortableContext
        items={allSortableIds}
        strategy={verticalListSortingStrategy}
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
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeItem?.type === "scene" && (
          <div className="opacity-70 bg-zinc-800/90 rounded border border-zinc-600 p-2 text-[14px] text-zinc-300 shadow-lg max-w-md truncate">
            {activeItem.label}
          </div>
        )}
        {activeItem?.type === "chapter" && (
          <div className="opacity-70 bg-zinc-800/90 rounded border border-zinc-600 px-3 py-1.5 text-[16px] font-semibold text-zinc-300 shadow-lg">
            {activeItem.label}
          </div>
        )}
        {activeItem?.type === "act" && (
          <div className="opacity-70 bg-zinc-800/90 rounded border border-zinc-600 px-3 py-2 text-[20px] font-extrabold text-zinc-300 shadow-lg">
            {activeItem.label}
          </div>
        )}
      </DragOverlay>
      </DragTypeContext.Provider>
    </DndContext>
  );
}
