import { create } from "zustand";
import type { WritingProject, WritingAct, WritingChapterV2, WritingScene, WritingSetting, WritingSnapshot } from "../api/writing";
import * as writingApi from "../api/writing";

export type AiMode = "chat" | "continue" | "rewrite" | "expand" | "condense" | "beat_generate";

interface WritingState {
  // Data
  projects: WritingProject[];
  activeProjectId: string | null;
  acts: WritingAct[];
  activeSceneId: string | null;
  settings: WritingSetting[];

  // UI
  aiMode: AiMode;
  sidebarWidth: number;
  isChatPanelOpen: boolean;
  isLoaded: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;

  // Ghost Text
  ghostTextContent: string;
  ghostRequestId: string | null;
  setGhostText: (content: string, requestId: string) => void;
  clearGhostText: () => void;

  // Save
  saveStatus: "saved" | "saving" | "error";
  lastSavedAt: number | null;
  contentDirty: boolean;

  // Projects
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<WritingProject>;
  updateProject: (id: string, data: Partial<WritingProject>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string) => Promise<void>;

  // Manuscript
  loadManuscript: (projectId: string) => Promise<void>;

  // Acts
  createAct: (title?: string) => Promise<WritingAct>;
  updateActAction: (id: string, data: Partial<WritingAct>) => Promise<void>;
  deleteActAction: (id: string) => Promise<void>;

  // Chapters
  createChapter: (actId: string, title?: string) => Promise<WritingChapterV2>;
  updateChapterAction: (id: string, data: Partial<WritingChapterV2>) => Promise<void>;
  deleteChapterAction: (id: string) => Promise<void>;

  // Scenes
  createScene: (chapterId: string) => Promise<WritingScene>;
  updateSceneContent: (sceneId: string, content: object) => Promise<void>;
  deleteSceneAction: (sceneId: string) => Promise<void>;
  setActiveScene: (sceneId: string | null) => void;

  // Settings
  loadSettings: (projectId: string) => Promise<void>;
  createSetting: (name: string, category?: string, parentId?: string | null) => Promise<WritingSetting>;
  updateSetting: (id: string, data: Partial<WritingSetting>) => Promise<void>;
  deleteSetting: (id: string) => Promise<void>;

  // Snapshots
  snapshots: WritingSnapshot[];
  loadSnapshots: (projectId: string) => Promise<void>;
  createManualSnapshot: (label?: string) => Promise<void>;
  restoreFromSnapshot: (snapshotId: string) => Promise<void>;
  deleteSnapshotAction: (snapshotId: string) => Promise<void>;

  // UI
  setAiMode: (mode: AiMode) => void;
  setSidebarWidth: (w: number) => void;
  toggleChatPanel: () => void;
  getActiveProject: () => WritingProject | undefined;
}

export const useWritingStore = create<WritingState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  acts: [],
  activeSceneId: null,
  settings: [],
  aiMode: "chat",
  sidebarWidth: 280,
  isChatPanelOpen: false,
  isLoaded: false,
  focusMode: false,
  typewriterMode: false,
  saveStatus: "saved",
  lastSavedAt: null,
  contentDirty: false,
  snapshots: [],
  ghostTextContent: "",
  ghostRequestId: null,

  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
  setGhostText: (content, requestId) => set({ ghostTextContent: content, ghostRequestId: requestId }),
  clearGhostText: () => set({ ghostTextContent: "", ghostRequestId: null }),
  setAiMode: (mode) => set({ aiMode: mode }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(500, w)) }),
  toggleChatPanel: () => set((s) => ({ isChatPanelOpen: !s.isChatPanelOpen })),

  loadProjects: async () => {
    const projects = await writingApi.listProjects();
    set({ projects, isLoaded: true });
  },

  createProject: async (name) => {
    const project = await writingApi.createProject(name);
    set((s) => ({ projects: [project, ...s.projects], activeProjectId: project.id, acts: [], activeSceneId: null, settings: [] }));
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
      acts: s.activeProjectId === id ? [] : s.acts,
      activeSceneId: s.activeProjectId === id ? null : s.activeSceneId,
    }));
  },

  setActiveProject: async (id) => {
    set({ activeProjectId: id, acts: [], activeSceneId: null, settings: [] });
    if (id) {
      await get().loadManuscript(id);
      await get().loadSettings(id);
    }
  },

  loadManuscript: async (projectId) => {
    try {
      const data = await writingApi.getManuscript(projectId);
      set({ acts: data.acts as WritingAct[] });
    } catch {
      set({ acts: [] });
    }
  },

  createAct: async (title) => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("No project selected");
    const act = await writingApi.createAct(activeProjectId, title);
    await get().loadManuscript(activeProjectId);
    return act;
  },

  updateActAction: async (id, data) => {
    const { activeProjectId } = get();
    await writingApi.updateAct(id, data);
    if (activeProjectId) await get().loadManuscript(activeProjectId);
  },

  deleteActAction: async (id) => {
    const { activeProjectId } = get();
    await writingApi.deleteAct(id);
    if (activeProjectId) await get().loadManuscript(activeProjectId);
  },

  createChapter: async (actId, title) => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("No project selected");
    const chapter = await writingApi.createChapterV2(actId, activeProjectId, title);
    await get().loadManuscript(activeProjectId);
    return chapter;
  },

  updateChapterAction: async (id, data) => {
    const { activeProjectId } = get();
    await writingApi.updateChapter(id, data);
    if (activeProjectId) await get().loadManuscript(activeProjectId);
  },

  deleteChapterAction: async (id) => {
    const { activeProjectId } = get();
    await writingApi.deleteChapter(id);
    if (activeProjectId) await get().loadManuscript(activeProjectId);
  },

  createScene: async (chapterId) => {
    const scene = await writingApi.createScene(chapterId);
    set({ activeSceneId: scene.id });
    if (get().activeProjectId) await get().loadManuscript(get().activeProjectId!);
    return scene;
  },

  updateSceneContent: async (sceneId, content) => {
    set({ saveStatus: "saving" });
    try {
      await writingApi.updateScene(sceneId, { content: content as any });
      set({ saveStatus: "saved", lastSavedAt: Date.now(), contentDirty: false });
    } catch {
      set({ saveStatus: "error" });
    }
  },

  deleteSceneAction: async (sceneId) => {
    await writingApi.deleteScene(sceneId);
    if (get().activeProjectId) await get().loadManuscript(get().activeProjectId!);
  },

  setActiveScene: (sceneId) => set({ activeSceneId: sceneId }),

  loadSettings: async (projectId) => {
    const settings = await writingApi.listSettings(projectId);
    set({ settings });
  },

  createSetting: async (name, category = "custom", parentId = null) => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("No project selected");
    const setting = await writingApi.createSetting(activeProjectId, name, category, parentId);
    set((s) => ({ settings: [...s.settings, setting] }));
    return setting;
  },

  updateSetting: async (id, data) => {
    set({ saveStatus: "saving" });
    try {
      const setting = await writingApi.updateSetting(id, data);
      set((s) => ({ settings: s.settings.map((st) => (st.id === id ? setting : st)), saveStatus: "saved", lastSavedAt: Date.now() }));
    } catch {
      set({ saveStatus: "error" });
    }
  },

  deleteSetting: async (id) => {
    await writingApi.deleteSetting(id);
    set((s) => ({ settings: s.settings.filter((st) => st.id !== id && st.parent_id !== id) }));
  },

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
    const { activeProjectId } = get();
    if (activeProjectId) {
      set({ activeSceneId: null });
      await get().loadManuscript(activeProjectId);
      await get().loadSettings(activeProjectId);
      await get().loadSnapshots(activeProjectId);
    }
  },

  deleteSnapshotAction: async (snapshotId) => {
    await writingApi.deleteSnapshot(snapshotId);
    set((s) => ({ snapshots: s.snapshots.filter((snap) => snap.id !== snapshotId) }));
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
