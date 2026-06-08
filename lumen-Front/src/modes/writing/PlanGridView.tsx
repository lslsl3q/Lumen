import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { arrayMove } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import { PlanActRow } from "./PlanActRow";
import { PlanChapterRow } from "./PlanChapterRow";
import { PlanSceneRow } from "./PlanSceneRow";
import {
  type DragData,
  buildSceneChapterMap,
  buildChapterActMap,
  filterActs,
} from "./usePlanDrag";
import { extractDocText } from "../../lib/tiptap";
import { updateScene, updateChapter } from "../../api/writing";

const planCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

export function PlanGridView({ searchQuery }: { searchQuery: string }) {
  const acts = useWritingStore((s) => s.acts);
  const createScene = useWritingStore((s) => s.createScene);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"act" | "chapter" | "scene" | null>(null);

  // Track which container the active item currently belongs to (for onDragOver dedup)
  const lastOverContainer = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const sceneChapterMap = useMemo(() => buildSceneChapterMap(acts as any[]), [acts]);
  const chapterActMap = useMemo(() => buildChapterActMap(acts as any[]), [acts]);

  const filteredActs = useMemo(() => filterActs(acts as any[], searchQuery), [acts, searchQuery]);

  // ── DragOverlay data ──

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
            return { label: extractDocText(sc.summary) || "场景" };
        }
      }
    }
    return null;
  }, [activeId, activeType, filteredActs]);

  const activeScene = useMemo(() => {
    if (!activeId || activeType !== "scene") return null;
    for (const act of filteredActs) {
      for (const ch of (act as any).chapters || []) {
        const sc = (ch.scenes || []).find((s: any) => s.id === activeId);
        if (sc) return sc;
      }
    }
    return null;
  }, [activeId, activeType, filteredActs]);

  const activeChapter = useMemo(() => {
    if (!activeId || activeType !== "chapter") return null;
    for (const act of filteredActs) {
      const ch = ((act as any).chapters || []).find((c: any) => c.id === activeId);
      if (ch) return ch;
    }
    return null;
  }, [activeId, activeType, filteredActs]);

  const activeAct = useMemo(() => {
    if (!activeId || activeType !== "act") return null;
    return filteredActs.find((a) => a.id === activeId) || null;
  }, [activeId, activeType, filteredActs]);

  // ── onDragStart ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    setActiveType(data.type);
    if (data.type === "act") setActiveId(data.actId);
    else if (data.type === "chapter") setActiveId(data.chapterId);
    else if (data.type === "scene") setActiveId(data.sceneId);
    lastOverContainer.current = null;
  }, []);

  // ── onDragOver — cross-container optimistic update ──

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as DragData | undefined;
    const overData = over.data.current as { type?: string } | undefined;
    if (!activeData || !overData) return;

    // ── Scene cross-Chapter ──
    if (activeData.type === "scene") {
      const srcChapterId = activeData.chapterId;
      let tgtChapterId: string | null = null;

      if (overData.type === "scene") {
        tgtChapterId = sceneChapterMap.get(String(over.id))?.chapterId || null;
      } else if (overData.type === "chapter") {
        tgtChapterId = String(over.id);
      }

      if (tgtChapterId && tgtChapterId !== srcChapterId && tgtChapterId !== lastOverContainer.current) {
        lastOverContainer.current = tgtChapterId;
        const currentActs = useWritingStore.getState().acts as any[];
        const sceneId = activeData.sceneId;
        const scene = currentActs
          .flatMap((a) => (a.chapters || []))
          .flatMap((c: any) => c.scenes || [])
          .find((sc: any) => sc.id === sceneId);
        if (!scene) return;

        const updatedActs = currentActs.map((act) => ({
          ...act,
          chapters: (act.chapters || []).map((ch: any) => {
            if (ch.id === srcChapterId) {
              return { ...ch, scenes: ch.scenes.filter((sc: any) => sc.id !== sceneId) };
            }
            if (ch.id === tgtChapterId) {
              const newScenes = [...ch.scenes.filter((sc: any) => sc.id !== sceneId), scene];
              return { ...ch, scenes: newScenes };
            }
            return ch;
          }),
        }));
        useWritingStore.setState({ acts: updatedActs });
      }
    }

    // ── Chapter cross-Act ──
    if (activeData.type === "chapter") {
      const srcActId = activeData.actId;
      let tgtActId: string | null = null;

      if (overData.type === "chapter") {
        tgtActId = chapterActMap.get(String(over.id))?.actId || null;
      } else if (overData.type === "act") {
        tgtActId = String(over.id);
      }

      if (tgtActId && tgtActId !== srcActId && tgtActId !== lastOverContainer.current) {
        lastOverContainer.current = tgtActId;
        const currentActs = useWritingStore.getState().acts as any[];
        const chapterId = activeData.chapterId;
        const chapter = currentActs
          .flatMap((a) => (a.chapters || []))
          .find((ch: any) => ch.id === chapterId);
        if (!chapter) return;

        const updatedActs = currentActs.map((act) => {
          if (act.id === srcActId) {
            return { ...act, chapters: act.chapters.filter((ch: any) => ch.id !== chapterId) };
          }
          if (act.id === tgtActId) {
            const newChapters = [...act.chapters.filter((ch: any) => ch.id !== chapterId), { ...chapter, act_id: tgtActId }];
            return { ...act, chapters: newChapters };
          }
          return act;
        });
        useWritingStore.setState({ acts: updatedActs });
      }
    }
  }, [sceneChapterMap, chapterActMap]);

  // ── onDragEnd — persist changes ──

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      setActiveType(null);
      lastOverContainer.current = null;

      const { active, over } = event;
      if (!over || !activeId) return;

      const data = active.data.current as DragData | undefined;
      if (!data) return;

      const overData = over.data.current as { type?: string } | undefined;
      const overId = String(over.id);

      // Don't persist if dropped on itself
      if (String(active.id) === overId) return;

      const store = useWritingStore.getState();

      try {
        if (data.type === "scene") {
          const currentActs = store.acts as any[];
          // Find the chapter the scene is currently in (after onDragOver may have moved it)
          let currentChapterId: string | null = null;
          for (const act of currentActs) {
            for (const ch of act.chapters || []) {
              if ((ch.scenes || []).some((sc: any) => sc.id === data.sceneId)) {
                currentChapterId = ch.id;
                break;
              }
            }
            if (currentChapterId) break;
          }
          if (!currentChapterId) return;

          // Determine final position
          const chapter = currentActs.flatMap((a) => a.chapters || []).find((ch: any) => ch.id === currentChapterId);
          if (!chapter) return;

          const sceneIds = (chapter.scenes || []).map((sc: any) => sc.id);
          const fromIdx = sceneIds.indexOf(data.sceneId);
          let toIdx: number;

          if (overData?.type === "scene") {
            toIdx = sceneIds.indexOf(overId);
          } else {
            // Dropped on chapter — append at end
            toIdx = sceneIds.length - 1;
          }

          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

          const reordered = arrayMove(sceneIds, fromIdx, toIdx) as string[];
          // Apply local reorder with updated sort_order
          const reorderedScenes = reordered.map((id, index) => {
            const sc = chapter.scenes.find((s: any) => s.id === id);
            return sc ? { ...sc, sort_order: index } : null;
          }).filter(Boolean);
          const updatedActs = (store.acts as any[]).map((act) => ({
            ...act,
            chapters: (act.chapters || []).map((ch: any) =>
              ch.id === currentChapterId ? { ...ch, scenes: reorderedScenes } : ch,
            ),
          }));
          useWritingStore.setState({ acts: updatedActs });

          // Persist
          await store.reorderScenesAction(currentChapterId!, reordered);

          // Also persist chapter change if cross-chapter
          const originalChapterId = sceneChapterMap.get(data.sceneId)?.chapterId;
          if (originalChapterId && originalChapterId !== currentChapterId) {
            // Scene was moved to a different chapter — update chapter_id
            await updateScene(data.sceneId, { chapter_id: currentChapterId });
          }
        } else if (data.type === "chapter") {
          const currentActs = store.acts as any[];
          let currentActId: string | null = null;
          for (const act of currentActs) {
            if ((act.chapters || []).some((ch: any) => ch.id === data.chapterId)) {
              currentActId = act.id;
              break;
            }
          }
          if (!currentActId) return;

          const act = currentActs.find((a) => a.id === currentActId);
          if (!act) return;

          const chapterIds = (act.chapters || []).map((ch: any) => ch.id);
          const fromIdx = chapterIds.indexOf(data.chapterId);
          let toIdx: number;

          if (overData?.type === "chapter") {
            toIdx = chapterIds.indexOf(overId);
          } else {
            toIdx = chapterIds.length - 1;
          }

          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

          const reordered = arrayMove(chapterIds, fromIdx, toIdx) as string[];
          const reorderedChapters = reordered.map((id, index) => {
            const ch = act.chapters.find((c: any) => c.id === id);
            return ch ? { ...ch, sort_order: index } : null;
          }).filter(Boolean);
          const updatedActs = (store.acts as any[]).map((a) =>
            a.id === currentActId ? { ...a, chapters: reorderedChapters } : a,
          );
          useWritingStore.setState({ acts: updatedActs });

          await store.reorderChaptersAction(currentActId!, reordered);

          const originalActId = chapterActMap.get(data.chapterId)?.actId;
          if (originalActId && originalActId !== currentActId) {
            await updateChapter(data.chapterId, { act_id: currentActId });
          }
        } else if (data.type === "act") {
          const actIds = (store.acts as any[]).map((a) => a.id);
          const fromIdx = actIds.indexOf(data.actId);
          const toIdx = actIds.indexOf(overId);
          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

          const reordered = arrayMove(actIds, fromIdx, toIdx) as string[];
          // Update local sort_order for acts
          const updatedActs = (store.acts as any[]).map((act) => {
            const newOrder = reordered.indexOf(act.id);
            return newOrder !== -1 ? { ...act, sort_order: newOrder } : act;
          });
          useWritingStore.setState({ acts: updatedActs });
          if (store.activeProjectId) {
            await store.reorderActsAction(store.activeProjectId, reordered);
          }
        }
      } catch (err) {
        console.error("[PlanGrid] dragEnd failed:", err);
        // Revert on failure
        if (store.activeProjectId) store.loadManuscript(store.activeProjectId);
      }
    },
    [activeId, activeType, sceneChapterMap, chapterActMap],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={planCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={filteredActs.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3 items-stretch">
          {filteredActs.map((act) => {
            const chapters = (act as any).chapters || [];
            return (
              <PlanActRow key={act.id} act={act}>
                <SortableContext items={chapters.map((ch: any) => ch.id)} strategy={verticalListSortingStrategy}>
                  {chapters.map((ch: any) => {
                    const scenes = ch.scenes || [];
                    return (
                      <PlanChapterRow key={ch.id} chapter={ch}>
                        <SortableContext items={scenes.map((sc: any) => sc.id)} strategy={verticalListSortingStrategy}>
                          {scenes.map((sc: any) => (
                            <PlanSceneRow key={sc.id} scene={sc} />
                          ))}
                        </SortableContext>
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
                </SortableContext>
              </PlanActRow>
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeItem && activeType === "scene" && activeScene && (
          <div className="flex gap-1 items-center py-0.5 rounded opacity-90 shadow-xl shadow-black/40">
            <div className="flex-none w-6 h-6 flex items-center justify-center text-zinc-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
              </svg>
            </div>
            <div className="grow flex flex-col border border-zinc-400/40 shadow-sm rounded focus-within:ring-1 focus-within:ring-zinc-600 focus-within:border-zinc-600">
              {(() => {
                const summaryText = extractDocText(activeScene.summary || "");
                if (summaryText) {
                  return (
                    <div className="flex-1 min-h-[56px] text-[14px] leading-[22.75px] font-normal text-zinc-300 p-2 whitespace-pre-wrap break-words">
                      {summaryText}
                    </div>
                  );
                }
                const contentText = extractDocText(activeScene.content || "");
                if (contentText) {
                  const lines = contentText.split('\n').filter((l: string) => l.trim());
                  const displayLines = lines.slice(0, 3);
                  const truncated = displayLines.join('\n') + (lines.length > 3 ? '...' : '');
                  return (
                    <div className="flex-1 min-h-[56px] text-[14px] leading-[22.75px] font-normal text-zinc-300 p-2 whitespace-pre-wrap break-words">
                      {truncated}
                    </div>
                  );
                }
                return (
                  <div className="flex-1 min-h-[56px] text-[14px] leading-[22.75px] font-normal text-zinc-600 p-2">
                    场景摘要…
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        {activeItem && activeType === "chapter" && activeChapter && (
          <div className="rounded opacity-90 shadow-xl shadow-black/40">
            <div className="flex items-center">
              <div className="flex-none w-6 h-6 flex items-center justify-center text-zinc-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
                </svg>
              </div>
              <div className="flex items-center justify-center p-0.5 text-zinc-500">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
              <div className="flex flex-col leading-none grow">
                <span className="opacity-50 text-xs font-medium text-zinc-300">
                  第{(activeChapter.sort_order ?? 0) + 1}章
                </span>
                <span className="text-[16px] font-semibold text-zinc-300">{activeChapter.title || "章节标题..."}</span>
              </div>
            </div>
          </div>
        )}
        {activeItem && activeType === "act" && activeAct && (
          <div className="flex py-2 items-start rounded opacity-90 shadow-xl shadow-black/40">
            <div className="flex-none mr-2 flex items-center justify-center h-8 w-6 mt-2 text-zinc-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
              </svg>
            </div>
            <div className="grow flex flex-col">
              <div className="flex py-2 items-center">
                <div className="flex items-center justify-center p-0.5 text-zinc-500">
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
                <span className="font-extrabold text-[20px] leading-7 text-zinc-300 opacity-60 mr-0.5 whitespace-nowrap select-none">
                  Act {(activeAct.sort_order ?? 0) + 1}:
                </span>
                <span className="flex-1 text-[20px] font-extrabold leading-7 text-zinc-300">{activeAct.title || "卷"}</span>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
