import * as writingApi from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";

// ── Drag data types ──

export interface ActDragData {
  type: "act";
  actId: string;
}
export interface ChapterDragData {
  type: "chapter";
  chapterId: string;
  actId: string;
}
export interface SceneDragData {
  type: "scene";
  sceneId: string;
  chapterId: string;
}
export type DragData = ActDragData | ChapterDragData | SceneDragData;

// ── Map builders ──

export function buildSceneChapterMap(acts: any[]) {
  const map = new Map<string, { chapterId: string; sceneIds: string[] }>();
  for (const act of acts) {
    for (const ch of act.chapters || []) {
      const ids = (ch.scenes || []).map((s: any) => s.id);
      for (const sc of ch.scenes || []) {
        map.set(sc.id, { chapterId: ch.id, sceneIds: ids });
      }
    }
  }
  return map;
}

export function buildChapterActMap(acts: any[]) {
  const map = new Map<string, { actId: string; chapterIds: string[] }>();
  for (const act of acts) {
    const chIds = (act.chapters || []).map((ch: any) => ch.id);
    for (const ch of act.chapters || []) {
      map.set(ch.id, { actId: act.id, chapterIds: chIds });
    }
  }
  return map;
}

// ── Drag handlers ──

export async function handleSceneDrag(
  sceneId: string,
  overId: string,
  overType: string | undefined,
  sceneChapterMap: Map<string, { chapterId: string; sceneIds: string[] }>,
  acts: any[],
) {
  const store = useWritingStore.getState();
  const srcInfo = sceneChapterMap.get(sceneId);
  if (!srcInfo) return;

  let tgtChapterId: string | null = null;
  let tgtSceneIds: string[] = [];

  if (overType === "scene") {
    const overInfo = sceneChapterMap.get(overId);
    if (overInfo) {
      tgtChapterId = overInfo.chapterId;
      tgtSceneIds = [...overInfo.sceneIds];
    }
  } else if (overType === "chapter") {
    tgtChapterId = overId;
    for (const act of acts) {
      for (const ch of act.chapters || []) {
        if (ch.id === overId) {
          tgtSceneIds = (ch.scenes || []).map((s: any) => s.id);
          break;
        }
      }
    }
  }

  if (!tgtChapterId) return;
  if (srcInfo.chapterId === tgtChapterId && sceneId === overId) return;

  if (srcInfo.chapterId !== tgtChapterId) {
    // Cross-chapter move — optimistic local update
    const currentActs = store.acts as any[];
    const updatedActs = currentActs.map((act) => ({
      ...act,
      chapters: (act.chapters || []).map((ch: any) => {
        if (ch.id === srcInfo.chapterId) {
          // Remove scene from source
          return { ...ch, scenes: ch.scenes.filter((sc: any) => sc.id !== sceneId) };
        }
        if (ch.id === tgtChapterId) {
          // Insert scene into target at position
          const overIdx = overType === "scene" ? tgtSceneIds.indexOf(overId) : -1;
          const scene = currentActs.flatMap((a) => (a.chapters || [])).flatMap((c: any) => c.scenes || []).find((sc: any) => sc.id === sceneId);
          const newScenes = [...ch.scenes.filter((sc: any) => sc.id !== sceneId)];
          if (overIdx === -1) newScenes.push(scene);
          else newScenes.splice(overIdx, 0, scene);
          return { ...ch, scenes: newScenes, scene_count: newScenes.length };
        }
        return ch;
      }),
    }));
    useWritingStore.setState({ acts: updatedActs });
    // Persist in background
    const updatedTgtIds = [...tgtSceneIds];
    const oi = overType === "scene" ? updatedTgtIds.indexOf(overId) : -1;
    if (oi === -1) updatedTgtIds.push(sceneId);
    else updatedTgtIds.splice(oi, 0, sceneId);
    const srcRemaining = srcInfo.sceneIds.filter((id) => id !== sceneId);
    Promise.all([
      writingApi.updateScene(sceneId, { chapter_id: tgtChapterId }),
      writingApi.reorderScenes(tgtChapterId, updatedTgtIds),
      srcRemaining.length > 0 ? writingApi.reorderScenes(srcInfo.chapterId, srcRemaining) : Promise.resolve(),
    ]).catch(() => {
      // Revert on failure
      if (store.activeProjectId) store.loadManuscript(store.activeProjectId);
    });
  } else {
    // Same chapter reorder
    if (sceneId === overId) return;
    const ids = [...srcInfo.sceneIds];
    const fromIdx = ids.indexOf(sceneId);
    const toIdx = ids.indexOf(overId);
    if (fromIdx === -1 || toIdx === -1) return;
    await store.reorderScenesAction(srcInfo.chapterId, arrayMoveSimple(ids, fromIdx, toIdx));
  }
}

export async function handleChapterDrag(
  chapterId: string,
  overId: string,
  overType: string | undefined,
  chapterActMap: Map<string, { actId: string; chapterIds: string[] }>,
  acts: any[],
) {
  const store = useWritingStore.getState();
  const srcInfo = chapterActMap.get(chapterId);
  if (!srcInfo) return;

  let tgtActId: string | null = null;
  let tgtChapterIds: string[] = [];

  if (overType === "chapter") {
    const overInfo = chapterActMap.get(overId);
    if (overInfo) {
      tgtActId = overInfo.actId;
      tgtChapterIds = [...overInfo.chapterIds];
    }
  } else if (overType === "act") {
    tgtActId = overId;
    for (const act of acts) {
      if (act.id === overId) {
        tgtChapterIds = (act.chapters || []).map((ch: any) => ch.id);
        break;
      }
    }
  }

  if (!tgtActId) return;
  if (srcInfo.actId === tgtActId && chapterId === overId) return;

  if (srcInfo.actId !== tgtActId) {
    // Cross-act move — optimistic local update
    const acts = store.acts as any[];
    const chapter = acts.flatMap((a) => (a.chapters || [])).find((ch: any) => ch.id === chapterId);
    if (!chapter) return;
    const updatedActs = acts.map((act) => {
      if (act.id === srcInfo.actId) {
        return { ...act, chapters: act.chapters.filter((ch: any) => ch.id !== chapterId) };
      }
      if (act.id === tgtActId) {
        const newChapters = [...act.chapters.filter((ch: any) => ch.id !== chapterId)];
        const overIdx = overType === "chapter" ? tgtChapterIds.indexOf(overId) : -1;
        if (overIdx === -1) newChapters.push({ ...chapter, act_id: tgtActId });
        else newChapters.splice(overIdx, 0, { ...chapter, act_id: tgtActId });
        return { ...act, chapters: newChapters };
      }
      return act;
    });
    useWritingStore.setState({ acts: updatedActs });
    // Persist in background
    const updatedTgtIds = [...tgtChapterIds];
    const oi = overType === "chapter" ? updatedTgtIds.indexOf(overId) : -1;
    if (oi === -1) updatedTgtIds.push(chapterId);
    else updatedTgtIds.splice(oi, 0, chapterId);
    const srcRemaining = srcInfo.chapterIds.filter((id) => id !== chapterId);
    Promise.all([
      writingApi.updateChapter(chapterId, { act_id: tgtActId }),
      writingApi.reorderChapters(tgtActId, updatedTgtIds),
      srcRemaining.length > 0 ? writingApi.reorderChapters(srcInfo.actId, srcRemaining) : Promise.resolve(),
    ]).catch(() => {
      if (store.activeProjectId) store.loadManuscript(store.activeProjectId);
    });
  } else {
    // Same act reorder
    if (chapterId === overId) return;
    const ids = [...srcInfo.chapterIds];
    const fromIdx = ids.indexOf(chapterId);
    const toIdx = ids.indexOf(overId);
    if (fromIdx === -1 || toIdx === -1) return;
    await store.reorderChaptersAction(srcInfo.actId, arrayMoveSimple(ids, fromIdx, toIdx));
  }
}

export async function handleActDrag(actId: string, overId: string, acts: any[]) {
  if (actId === overId) return;
  const store = useWritingStore.getState();
  const actIds = acts.map((a: any) => a.id);
  const fromIdx = actIds.indexOf(actId);
  const toIdx = actIds.indexOf(overId);
  if (fromIdx === -1 || toIdx === -1) return;
  if (store.activeProjectId) {
    await store.reorderActsAction(store.activeProjectId, arrayMoveSimple(actIds, fromIdx, toIdx));
  }
}

// ── Utilities ──

export function arrayMoveSimple<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function filterActs(acts: any[], searchQuery: string) {
  const q = searchQuery.toLowerCase().trim();
  if (!q) return acts;
  return acts.filter((act) => {
    const chapters = act.chapters || [];
    if ((act.title || "").toLowerCase().includes(q)) return true;
    return chapters.some((ch: any) => {
      if ((ch.title || "").toLowerCase().includes(q)) return true;
      return (ch.scenes || []).some((sc: any) =>
        ((sc.summary || "") + (sc.subtitle || "")).toLowerCase().includes(q),
      );
    });
  });
}
