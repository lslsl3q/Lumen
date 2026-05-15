/**
 * T11 useWritingStore — 写作模式全局状态
 */
import { create } from "zustand";
import type { WritingProject, WritingChapter, WritingSetting, WritingSnapshot } from "../api/writing";
import * as writingApi from "../api/writing";

export type AiMode = "chat" | "continue" | "rewrite" | "expand" | "condense" | "beat_generate";

interface WritingState {
  // 数据
  projects: WritingProject[];
  activeProjectId: string | null;
  chapters: WritingChapter[];
  activeChapterId: string | null;
  settings: WritingSetting[];

  // UI 状态
  aiMode: AiMode;
  sidebarWidth: number;
  isChatPanelOpen: boolean;
  isLoaded: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;

  // Ghost Text（AI 续写流式预览）
  ghostTextContent: string;
  ghostRequestId: string | null;
  setGhostText: (content: string, requestId: string) => void;
  clearGhostText: () => void;

  // 保存状态
  saveStatus: "saved" | "saving" | "error";
  lastSavedAt: number | null;
  contentDirty: boolean;

  // 快照
  snapshots: WritingSnapshot[];
  loadSnapshots: (projectId: string) => Promise<void>;
  createManualSnapshot: (label?: string) => Promise<void>;
  restoreFromSnapshot: (snapshotId: string) => Promise<void>;
  deleteSnapshotAction: (snapshotId: string) => Promise<void>;

  // 作品
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<WritingProject>;
  updateProject: (id: string, data: Partial<WritingProject>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string) => Promise<void>;

  // 章节
  loadChapters: (projectId: string) => Promise<void>;
  createChapter: (title: string, volume?: string) => Promise<WritingChapter>;
  updateChapter: (id: string, data: Partial<WritingChapter>) => Promise<void>;
  renameChapter: (id: string, title: string) => Promise<void>;
  deleteChapter: (id: string) => Promise<void>;
  reorderChapters: (orderedIds: string[]) => Promise<void>;
  setActiveChapter: (id: string) => void;

  // 设定
  loadSettings: (projectId: string) => Promise<void>;
  createSetting: (name: string, category?: string, parentId?: string | null) => Promise<WritingSetting>;
  updateSetting: (id: string, data: Partial<WritingSetting>) => Promise<void>;
  deleteSetting: (id: string) => Promise<void>;

  // UI
  setAiMode: (mode: AiMode) => void;
  setSidebarWidth: (w: number) => void;
  toggleChatPanel: () => void;

  // 获取当前章节内容（从 store 中）
  getActiveChapter: () => WritingChapter | undefined;
  getActiveProject: () => WritingProject | undefined;
}

export const useWritingStore = create<WritingState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  chapters: [],
  activeChapterId: null,
  settings: [],
  aiMode: "chat",
  sidebarWidth: 280,
  isChatPanelOpen: false,
  isLoaded: false,
  focusMode: false,
  typewriterMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
  ghostTextContent: "",
  ghostRequestId: null,
  saveStatus: "saved",
  lastSavedAt: null,
  contentDirty: false,
  snapshots: [],

  // ── 作品 ──

  loadProjects: async () => {
    const projects = await writingApi.listProjects();
    set({ projects, isLoaded: true });
  },

  createProject: async (name) => {
    const project = await writingApi.createProject(name);
    set((s) => ({ projects: [project, ...s.projects], activeProjectId: project.id, chapters: [], activeChapterId: null, settings: [] }));
    // 新项目没有章节，但需加载设定（可能为空）
    await get().loadSettings(project.id);
    return project;
  },

  updateProject: async (id, data) => {
    const project = await writingApi.updateProject(id, data);
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? project : p)) }));
  },

  deleteProject: async (id) => {
    await writingApi.deleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      chapters: s.activeProjectId === id ? [] : s.chapters,
      activeChapterId: s.activeProjectId === id ? null : s.activeChapterId,
    }));
  },

  setActiveProject: async (id) => {
    set({ activeProjectId: id, chapters: [], activeChapterId: null, settings: [] });
    if (id) {
      await get().loadChapters(id);
      await get().loadSettings(id);
    }
  },

  // ── 章节 ──

  loadChapters: async (projectId) => {
    const chapters = await writingApi.listChapters(projectId);
    set({ chapters });
  },

  createChapter: async (title, volume = "") => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("未选择作品");
    const chapter = await writingApi.createChapter(activeProjectId, title, volume);
    set((s) => ({ chapters: [...s.chapters, chapter], activeChapterId: chapter.id }));
    return chapter;
  },

  updateChapter: async (id, data) => {
    set({ saveStatus: "saving" });
    try {
      const chapter = await writingApi.updateChapter(id, data);
      set((s) => ({
        chapters: s.chapters.map((c) => (c.id === id ? chapter : c)),
        saveStatus: "saved",
        lastSavedAt: Date.now(),
        contentDirty: false,
      }));
    } catch {
      set({ saveStatus: "error" });
    }
  },

  deleteChapter: async (id) => {
    await writingApi.deleteChapter(id);
    set((s) => ({
      chapters: s.chapters.filter((c) => c.id !== id),
      activeChapterId: s.activeChapterId === id ? null : s.activeChapterId,
    }));
  },

  renameChapter: async (id, title) => {
    const chapter = await writingApi.updateChapter(id, { title });
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === id ? chapter : c)),
    }));
  },

  reorderChapters: async (orderedIds) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    await writingApi.reorderChapters(activeProjectId, orderedIds);
    set((s) => ({
      chapters: orderedIds.map((id, i) => {
        const ch = s.chapters.find((c) => c.id === id);
        return ch ? { ...ch, sort_order: i } : ch;
      }).filter(Boolean) as typeof s.chapters,
    }));
  },

  setActiveChapter: (id) => set({ activeChapterId: id }),

  // ── 设定 ──

  loadSettings: async (projectId) => {
    const settings = await writingApi.listSettings(projectId);
    set({ settings });
  },

  createSetting: async (name, category = "custom", parentId = null) => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("未选择作品");
    const setting = await writingApi.createSetting(activeProjectId, name, category, parentId);
    set((s) => ({ settings: [...s.settings, setting] }));
    return setting;
  },

  updateSetting: async (id, data) => {
    set({ saveStatus: "saving" });
    try {
      const setting = await writingApi.updateSetting(id, data);
      set((s) => ({
        settings: s.settings.map((st) => (st.id === id ? setting : st)),
        saveStatus: "saved",
        lastSavedAt: Date.now(),
      }));
    } catch {
      set({ saveStatus: "error" });
    }
  },

  deleteSetting: async (id) => {
    await writingApi.deleteSetting(id);
    set((s) => ({
      settings: s.settings.filter((st) => st.id !== id && st.parent_id !== id),
    }));
  },

  // ── UI ──

  setAiMode: (mode) => set({ aiMode: mode }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(500, w)) }),
  toggleChatPanel: () => set((s) => ({ isChatPanelOpen: !s.isChatPanelOpen })),

  loadSnapshots: async (projectId) => {
    const { items } = await writingApi.listSnapshots(projectId);
    set({ snapshots: items });
  },

  createManualSnapshot: async (label) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    await writingApi.createSnapshot(activeProjectId, label);
    await get().loadSnapshots(activeProjectId);
  },

  restoreFromSnapshot: async (snapshotId) => {
    await writingApi.restoreSnapshot(snapshotId);
    const { activeProjectId, activeChapterId } = get();
    if (activeProjectId) {
      // 先清空 activeChapterId 触发编辑器卸载内容
      set({ activeChapterId: null });
      await get().loadChapters(activeProjectId);
      await get().loadSettings(activeProjectId);
      await get().loadSnapshots(activeProjectId);
      // 恢复 activeChapterId 触发编辑器重新加载
      if (activeChapterId) set({ activeChapterId });
    }
  },

  deleteSnapshotAction: async (snapshotId) => {
    await writingApi.deleteSnapshot(snapshotId);
    set((s) => ({ snapshots: s.snapshots.filter((snap) => snap.id !== snapshotId) }));
  },

  setGhostText: (content, requestId) => set({ ghostTextContent: content, ghostRequestId: requestId }),
  clearGhostText: () => set({ ghostTextContent: "", ghostRequestId: null }),

  // ── 访问器 ──

  getActiveChapter: () => {
    const { chapters, activeChapterId } = get();
    return chapters.find((c) => c.id === activeChapterId);
  },
  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
