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
    // Cross-chapter move
    await writingApi.updateScene(sceneId, { chapter_id: tgtChapterId });
    const overIdx = overType === "scene" ? tgtSceneIds.indexOf(overId) : -1;
    if (overIdx === -1) tgtSceneIds.push(sceneId);
    else tgtSceneIds.splice(overIdx, 0, sceneId);
    await writingApi.reorderScenes(tgtChapterId, tgtSceneIds);
    const srcRemaining = srcInfo.sceneIds.filter((id) => id !== sceneId);
    if (srcRemaining.length > 0) await writingApi.reorderScenes(srcInfo.chapterId, srcRemaining);
    if (store.activeProjectId) await store.loadManuscript(store.activeProjectId);
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
    // Cross-act move
    await writingApi.updateChapter(chapterId, { act_id: tgtActId });
    const overIdx = overType === "chapter" ? tgtChapterIds.indexOf(overId) : -1;
    if (overIdx === -1) tgtChapterIds.push(chapterId);
    else tgtChapterIds.splice(overIdx, 0, chapterId);
    await writingApi.reorderChapters(tgtActId, tgtChapterIds);
    const srcRemaining = srcInfo.chapterIds.filter((id) => id !== chapterId);
    if (srcRemaining.length > 0) await writingApi.reorderChapters(srcInfo.actId, srcRemaining);
    if (store.activeProjectId) await store.loadManuscript(store.activeProjectId);
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
