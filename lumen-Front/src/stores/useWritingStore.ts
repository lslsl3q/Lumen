import { create } from "zustand";
import type { WritingProject, WritingAct, ManuscriptAct, ManuscriptChapter, WritingChapter, WritingScene, CodexEntry, WritingSnapshot, WritingSnippet, WritingLabel, WritingChatThread, Plot, PlotArc, PlotLine, PlotNode, PlotBeat } from "../api/writing";
import * as writingApi from "../api/writing";

export type AiMode = "chat" | "continue" | "rewrite" | "expand" | "condense" | "beat_generate";

export interface FormatPreferences {
  // Typography
  fontFamily: string;
  textSizeMode: 's' | 'm' | 'l' | 'xl';
  lineHeightMode: 'none' | 's' | 'm' | 'l';
  textIndentMode: 'none' | 's' | 'm' | 'l';
  chicagoStyle: boolean;
  paragraphSpacingMode: 'none' | 's' | 'm' | 'l';
  pageWidthMode: 's' | 'm' | 'l' | 'xl' | 'full';
  textAlignMode: 'left' | 'justify';
  sceneDividerStyle: 'boxes' | 'line' | 'wave' | 'heart' | 'asterisks';
  // Cursor
  jumpPosition: 'start' | 'end';
  typewriterMode: boolean;
  smoothFollow: boolean;
  // Page
  colorizeAnnotations: boolean;
  // Statistics
  readingSpeed: number;
  wordsPerPage: number;
}

export const DEFAULT_FORMAT_PREFS: FormatPreferences = {
  fontFamily: 'serif',
  textSizeMode: 'm',
  lineHeightMode: 's',
  textIndentMode: 'none',
  chicagoStyle: false,
  paragraphSpacingMode: 's',
  pageWidthMode: 'l',
  textAlignMode: 'justify',
  sceneDividerStyle: 'line',
  jumpPosition: 'start',
  typewriterMode: false,
  smoothFollow: false,
  colorizeAnnotations: true,
  readingSpeed: 200,
  wordsPerPage: 250,
};

interface WritingState {
  // Data
  projects: WritingProject[];
  activeProjectId: string | null;
  acts: ManuscriptAct[];
  activeSceneId: string | null;
  codexEntries: CodexEntry[];
  activeCodexEntryId: string | null;
  snippets: WritingSnippet[];
  activeSnippetId: string | null;
  labels: WritingLabel[];
  manuscriptFilter: { type: "all" } | { type: "act"; id: string } | { type: "chapter"; id: string };
  setManuscriptFilter: (filter: WritingState["manuscriptFilter"]) => void;

  // Plot system
  plotTree: Plot | null;
  loadPlotTree: (projectId: string) => Promise<void>;
  createArcAction: (title?: string) => Promise<PlotArc | null>;
  updateArcAction: (id: string, data: Partial<Pick<PlotArc, "title" | "summary">>) => Promise<void>;
  deleteArcAction: (id: string) => Promise<void>;
  createLineAction: (arcId: string, name?: string, title?: string, type?: PlotLine["type"], color?: string) => Promise<PlotLine | null>;
  updateLineAction: (id: string, data: Partial<Pick<PlotLine, "name" | "title" | "type" | "color" | "status" | "summary">>) => Promise<void>;
  deleteLineAction: (id: string) => Promise<void>;
  createNodeAction: (lineId: string, title?: string, summary?: string, purpose?: string, startCh?: number, endCh?: number) => Promise<PlotNode | null>;
  updateNodeAction: (id: string, data: Partial<Pick<PlotNode, "title" | "summary" | "purpose" | "start_ch" | "end_ch" | "resolved">> & { scene_ids?: string[] }) => Promise<void>;
  deleteNodeAction: (id: string) => Promise<void>;
  createBeatAction: (nodeId: string, kind?: PlotBeat["kind"], summary?: string) => Promise<PlotBeat | null>;
  updateBeatAction: (id: string, data: Partial<Pick<PlotBeat, "kind" | "summary" | "effect">>) => Promise<void>;
  deleteBeatAction: (id: string) => Promise<void>;

  // Plan view state
  planViewMode: "grid" | "outline" | "matrix";
  setPlanViewMode: (mode: WritingState["planViewMode"]) => void;
  writingViewTab: "plan" | "write" | "chat" | "review" | "plot";
  setWritingViewTab: (tab: WritingState["writingViewTab"]) => void;
  showPromptManager: boolean;
  setShowPromptManager: (show: boolean) => void;
  showSettingsPanel: boolean;
  settingsPanelTab: "metadata" | "writing" | "export";
  setShowSettingsPanel: (show: boolean, tab?: "metadata" | "writing" | "export") => void;

  // UI
  aiMode: AiMode;
  sidebarWidth: number;
  isLoaded: boolean;
  chatThreads: WritingChatThread[];
  activeThreadId: string | null;
  chatPanelMode: "none" | "floating" | "pinned";
  chatPanelSide: "left" | "right";
  setChatPanelMode: (mode: "none" | "floating" | "pinned") => void;
  toggleChatPanelPin: () => void;
  loadChatThreads: (bookId: string) => Promise<void>;
  createChatThreadAction: (name?: string) => Promise<WritingChatThread | null>;
  deleteChatThreadAction: (id: string) => Promise<void>;
  updateChatThreadAction: (id: string, data: Partial<Pick<WritingChatThread, "name" | "ai_mode" | "pinned" | "pinned_side">>) => Promise<void>;
  setActiveThread: (id: string | null) => void;
  closeChatPanel: () => void;
  focusMode: boolean;
  typewriterMode: boolean;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  formatPreferences: FormatPreferences;
  updateFormatPreference: <K extends keyof FormatPreferences>(key: K, value: FormatPreferences[K]) => void;

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
  createChapter: (actId: string, title?: string) => Promise<WritingChapter>;
  updateChapterAction: (id: string, data: Partial<WritingChapter>) => Promise<void>;
  deleteChapterAction: (id: string) => Promise<void>;

  // Scenes
  createScene: (chapterId: string) => Promise<WritingScene>;
  updateSceneContent: (sceneId: string, content: unknown) => Promise<void>;
  patchScene: (sceneId: string, data: Partial<WritingScene>) => Promise<void>;
  updateSceneAction: (sceneId: string, data: Partial<WritingScene>) => Promise<void>;
  deleteSceneAction: (sceneId: string) => Promise<void>;
  setActiveScene: (sceneId: string | null) => void;
  reorderActsAction: (projectId: string, orderedIds: string[]) => Promise<void>;
  reorderChaptersAction: (actId: string, orderedIds: string[]) => Promise<void>;
  reorderScenesAction: (chapterId: string, orderedIds: string[]) => Promise<void>;

  // Codex
  loadCodex: (projectId: string) => Promise<void>;
  createCodexEntry: (name: string, type?: string, parentId?: string | null) => Promise<CodexEntry>;
  updateCodexEntry: (id: string, data: Partial<CodexEntry>) => Promise<void>;
  deleteCodexEntry: (id: string) => Promise<void>;
  setActiveCodexEntry: (id: string | null) => void;

  // Snapshots
  snapshots: WritingSnapshot[];
  loadSnapshots: (projectId: string) => Promise<void>;
  createManualSnapshot: (label?: string) => Promise<void>;
  restoreFromSnapshot: (snapshotId: string) => Promise<void>;
  deleteSnapshotAction: (snapshotId: string) => Promise<void>;

  // Snippets
  loadSnippets: (projectId: string) => Promise<void>;
  createSnippetAction: (name?: string) => Promise<WritingSnippet>;
  updateSnippetAction: (id: string, data: Partial<Pick<WritingSnippet, "name" | "content" | "pinned">>) => Promise<void>;
  deleteSnippetAction: (id: string) => Promise<void>;
  setActiveSnippet: (id: string | null) => void;

  // Labels
  loadLabels: (projectId: string) => Promise<void>;
  createLabelAction: (name?: string, color?: string) => Promise<WritingLabel>;
  updateLabelAction: (id: string, data: Partial<Pick<WritingLabel, "name" | "color">>) => Promise<void>;
  deleteLabelAction: (id: string) => Promise<void>;
  reorderLabelsAction: (projectId: string, orderedIds: string[]) => Promise<void>;

  // UI
  setAiMode: (mode: AiMode) => void;
  setSidebarWidth: (w: number) => void;

  getActiveProject: () => WritingProject | undefined;
}

export const useWritingStore = create<WritingState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  acts: [],
  activeSceneId: null,
  codexEntries: [],
  activeCodexEntryId: null,
  aiMode: "chat",
  sidebarWidth: 280,
  isLoaded: false,
  chatThreads: [],
  activeThreadId: null,
  chatPanelMode: "none",
  chatPanelSide: "right",
  focusMode: false,
  typewriterMode: (() => { try { const s = localStorage.getItem('lumen-format-prefs'); return s ? JSON.parse(s).typewriterMode ?? false : false; } catch { return false; } })(),
  saveStatus: "saved",
  lastSavedAt: null,
  contentDirty: false,
  snapshots: [],
  snippets: [],
  activeSnippetId: null,
  labels: [],
  manuscriptFilter: { type: "all" },
  plotTree: null,
  planViewMode: "outline",
  writingViewTab: "write",
  showPromptManager: false,
  showSettingsPanel: false,
  settingsPanelTab: "metadata",
  ghostTextContent: "",
  ghostRequestId: null,

  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
  formatPreferences: (() => {
    try {
      const saved = localStorage.getItem('lumen-format-prefs');
      return saved ? { ...DEFAULT_FORMAT_PREFS, ...JSON.parse(saved) } : DEFAULT_FORMAT_PREFS;
    } catch { return DEFAULT_FORMAT_PREFS; }
  })(),
  updateFormatPreference: (key, value) => set((s) => {
    const next = { ...s.formatPreferences, [key]: value };
    try { localStorage.setItem('lumen-format-prefs', JSON.stringify(next)); } catch {}
    return { formatPreferences: next };
  }),
  setGhostText: (content, requestId) => set({ ghostTextContent: content, ghostRequestId: requestId }),
  clearGhostText: () => set({ ghostTextContent: "", ghostRequestId: null }),
  setAiMode: (mode) => set({ aiMode: mode }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(500, w)) }),
  setChatPanelMode: (mode) => set({ chatPanelMode: mode }),
  toggleChatPanelPin: () => set((s) => {
    if (s.chatPanelMode === "floating") return { chatPanelMode: "pinned" as const };
    if (s.chatPanelMode === "pinned") return { chatPanelMode: "floating" as const };
    return {};
  }),
  setActiveThread: (id) => set({ activeThreadId: id }),
  closeChatPanel: () => set({ chatPanelMode: "none", activeThreadId: null }),
  loadChatThreads: async (bookId) => {
    const threads = await writingApi.listChatThreads(bookId);
    const s = get();
    // 如果当前没有活跃线程且有线程可选，自动选最新的
    const autoId = (!s.activeThreadId || !threads.find(t => t.id === s.activeThreadId)) && threads.length > 0
      ? threads[0].id
      : s.activeThreadId;
    set({ chatThreads: threads, activeThreadId: autoId });
  },
  createChatThreadAction: async (name) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return null;
    const thread = await writingApi.createChatThread(activeProjectId, name);
    set((s) => ({ chatThreads: [thread, ...s.chatThreads], activeThreadId: thread.id }));
    return thread;
  },
  deleteChatThreadAction: async (id) => {
    await writingApi.deleteChatThread(id);
    set((s) => ({
      chatThreads: s.chatThreads.filter((t) => t.id !== id),
      activeThreadId: s.activeThreadId === id ? null : s.activeThreadId,
      chatPanelMode: s.activeThreadId === id ? "none" : s.chatPanelMode,
    }));
  },
  updateChatThreadAction: async (id, data) => {
    const updated = await writingApi.updateChatThread(id, data);
    set((s) => ({
      chatThreads: s.chatThreads.map((t) => (t.id === id ? updated : t)),
    }));
  },

  loadProjects: async () => {
    const projects = await writingApi.listProjects();
    set({ projects, isLoaded: true });
  },

  createProject: async (name) => {
    const project = await writingApi.createProject(name);
    set((s) => ({ projects: [project, ...s.projects], activeProjectId: project.id, acts: [], activeSceneId: null, codexEntries: [] }));
    await get().loadCodex(project.id);
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
    set({ activeProjectId: id, acts: [], activeSceneId: null, codexEntries: [], chatThreads: [], activeThreadId: null, chatPanelMode: "none", plotTree: null });
    if (id) {
      await get().loadManuscript(id);
      await get().loadCodex(id);
      await get().loadChatThreads(id);
      await get().loadPlotTree(id);
    }
  },

  loadManuscript: async (projectId) => {
    try {
      const data = await writingApi.getManuscript(projectId);
      set({ acts: data.acts });
      await Promise.all([
        get().loadSnippets(projectId),
        get().loadLabels(projectId),
      ]);
    } catch {
      set({ acts: [], snippets: [], labels: [] });
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
    const chapter = await writingApi.createChapter(actId, activeProjectId, title);
    // Auto-create first scene in the new chapter
    await writingApi.createScene(chapter.id);
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
    // 乐观更新 acts 中的场景内容，让提及检测能立即看到变化
    set((s) => ({
      acts: s.acts.map((act) => ({
        ...act,
        chapters: act.chapters.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === sceneId ? { ...sc, content: content as WritingScene["content"] } : sc,
          ),
        })),
      })),
      saveStatus: "saving",
    }));
    try {
      await writingApi.updateScene(sceneId, { content: content as WritingScene["content"] });
      set({ saveStatus: "saved", lastSavedAt: Date.now(), contentDirty: false });
    } catch {
      set({ saveStatus: "error" });
    }
  },

  patchScene: async (sceneId, data) => {
    // 乐观更新 acts 中的场景字段（summary 等），不触发全量 reload
    set((s) => ({
      acts: s.acts.map((act) => ({
        ...act,
        chapters: act.chapters.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === sceneId ? { ...sc, ...data } : sc,
          ),
        })),
      })),
    }));
    await writingApi.updateScene(sceneId, data);
  },

  updateSceneAction: async (sceneId, data) => {
    await writingApi.updateScene(sceneId, data);
    const { activeProjectId } = get();
    if (activeProjectId) await get().loadManuscript(activeProjectId);
  },

  deleteSceneAction: async (sceneId) => {
    await writingApi.deleteScene(sceneId);
    if (get().activeProjectId) await get().loadManuscript(get().activeProjectId!);
  },

  setActiveScene: (sceneId) => set({ activeSceneId: sceneId }),

  reorderActsAction: async (projectId, orderedIds) => {
    // Optimistic: reorder acts locally
    const acts = get().acts;
    const idToAct = new Map(acts.map((a) => [a.id, a]));
    const reordered = orderedIds.map((id) => idToAct.get(id)).filter(Boolean) as ManuscriptAct[];
    set({ acts: reordered });
    // Persist in background
    writingApi.reorderActs(projectId, orderedIds).catch(() => {
      // Revert on failure
      if (get().activeProjectId) get().loadManuscript(get().activeProjectId!);
    });
  },

  reorderChaptersAction: async (actId, orderedIds) => {
    // Optimistic: reorder chapters within act locally
    set((s) => ({
      acts: s.acts.map((act) => {
        if (act.id !== actId) return act;
        const chMap = new Map(act.chapters.map((ch) => [ch.id, ch]));
        return { ...act, chapters: orderedIds.map((id) => chMap.get(id)).filter((c): c is ManuscriptChapter => !!c) };
      }),
    }));
    // Persist in background
    writingApi.reorderChapters(actId, orderedIds).catch(() => {
      const { activeProjectId } = get();
      if (activeProjectId) get().loadManuscript(activeProjectId);
    });
  },

  reorderScenesAction: async (chapterId, orderedIds) => {
    // Optimistic: reorder scenes within chapter locally
    set((s) => ({
      acts: s.acts.map((act) => ({
        ...act,
        chapters: act.chapters.map((ch) => {
          if (ch.id !== chapterId) return ch;
          const scMap = new Map(ch.scenes.map((sc) => [sc.id, sc]));
          return { ...ch, scenes: orderedIds.map((id) => scMap.get(id)).filter((s): s is WritingScene => !!s) };
        }),
      })),
    }));
    // Persist in background
    writingApi.reorderScenes(chapterId, orderedIds).catch(() => {
      const { activeProjectId } = get();
      if (activeProjectId) get().loadManuscript(activeProjectId);
    });
  },

  loadCodex: async (projectId) => {
    const entries = await writingApi.listCodex(projectId);
    set({ codexEntries: entries });
  },

  createCodexEntry: async (name, type = "custom", parentId = null) => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("No project selected");
    const entry = await writingApi.createCodex(activeProjectId, name, type, parentId);
    set((s) => ({ codexEntries: [...s.codexEntries, entry] }));
    return entry;
  },

  updateCodexEntry: async (id, data) => {
    set({ saveStatus: "saving" });
    try {
      const entry = await writingApi.updateCodex(id, data);
      set((s) => ({ codexEntries: s.codexEntries.map((e) => (e.id === id ? entry : e)), saveStatus: "saved", lastSavedAt: Date.now() }));
    } catch {
      set({ saveStatus: "error" });
    }
  },

  deleteCodexEntry: async (id) => {
    await writingApi.deleteCodex(id);
    set((s) => ({ codexEntries: s.codexEntries.filter((e) => e.id !== id && e.parent_id !== id) }));
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
      await get().loadCodex(activeProjectId);
      await get().loadSnapshots(activeProjectId);
    }
  },

  deleteSnapshotAction: async (snapshotId) => {
    await writingApi.deleteSnapshot(snapshotId);
    set((s) => ({ snapshots: s.snapshots.filter((snap) => snap.id !== snapshotId) }));
  },

  setManuscriptFilter: (filter) => set({ manuscriptFilter: filter }),
  setPlanViewMode: (mode) => set({ planViewMode: mode }),
  setWritingViewTab: (tab) => set({ writingViewTab: tab }),
  setShowPromptManager: (show) => set({ showPromptManager: show }),
  setShowSettingsPanel: (show, tab) => set({ showSettingsPanel: show, ...(tab ? { settingsPanelTab: tab } : {}) }),

  loadSnippets: async (projectId) => {
    const snippets = await writingApi.listSnippets(projectId);
    set({ snippets });
  },

  createSnippetAction: async (name = "") => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("No active project");
    const snippet = await writingApi.createSnippet(activeProjectId, name);
    set((s) => ({ snippets: [...s.snippets, snippet], activeSnippetId: snippet.id }));
    return snippet;
  },

  updateSnippetAction: async (id, data) => {
    const updated = await writingApi.updateSnippet(id, data);
    set((s) => ({ snippets: s.snippets.map((sn) => sn.id === id ? updated : sn) }));
  },

  deleteSnippetAction: async (id) => {
    await writingApi.deleteSnippet(id);
    set((s) => ({
      snippets: s.snippets.filter((sn) => sn.id !== id),
      activeSnippetId: s.activeSnippetId === id ? null : s.activeSnippetId,
    }));
  },

  setActiveSnippet: (id) => set({ activeSnippetId: id }),

  // ── Labels ──

  loadLabels: async (projectId) => {
    const labels = await writingApi.listLabels(projectId);
    set({ labels });
  },

  createLabelAction: async (name = "", color = "Gray") => {
    const pid = get().activeProjectId;
    if (!pid) throw new Error("No active project");
    const label = await writingApi.createLabel(pid, name, color);
    set((s) => ({ labels: [...s.labels, label] }));
    return label;
  },

  updateLabelAction: async (id, data) => {
    const updated = await writingApi.updateLabel(id, data);
    set((s) => ({ labels: s.labels.map((l) => (l.id === id ? { ...l, ...updated } : l)) }));
  },

  deleteLabelAction: async (id) => {
    await writingApi.deleteLabel(id);
    set((s) => ({ labels: s.labels.filter((l) => l.id !== id) }));
  },

  reorderLabelsAction: async (projectId, orderedIds) => {
    const idToLabel = new Map(get().labels.map((l) => [l.id, l]));
    const reordered = orderedIds.map((id) => idToLabel.get(id)).filter(Boolean) as WritingLabel[];
    set({ labels: reordered });
    writingApi.reorderLabels(projectId, orderedIds).catch(() => {
      set({ labels: get().labels });
    });
  },

  setActiveCodexEntry: (id) => set({ activeCodexEntryId: id }),

  // ── Plot System ──

  loadPlotTree: async (projectId) => {
    try {
      await writingApi.getPlot(projectId); // get-or-create，确保 plot 记录存在
      const tree = await writingApi.getPlotTree(projectId);
      set({ plotTree: tree });
    } catch {
      set({ plotTree: null });
    }
  },

  createArcAction: async (title = "") => {
    const { plotTree } = get();
    if (!plotTree) return null;
    const arc = await writingApi.createArc(plotTree.id, title);
    set((s) => ({
      plotTree: s.plotTree ? { ...s.plotTree, arcs: [...(s.plotTree.arcs || []), arc] } : null,
    }));
    return arc;
  },

  updateArcAction: async (id, data) => {
    const updated = await writingApi.updateArc(id, data);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => a.id === id ? { ...a, ...updated } : a),
      } : null,
    }));
  },

  deleteArcAction: async (id) => {
    await writingApi.deleteArc(id);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).filter((a) => a.id !== id),
      } : null,
    }));
  },

  createLineAction: async (arcId, name = "", title = "", type = "subplot" as const, color = "#6b7280") => {
    const line = await writingApi.createLine(arcId, name, title, type, color);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) =>
          a.id === arcId ? { ...a, lines: [...(a.lines || []), line] } : a
        ),
      } : null,
    }));
    return line;
  },

  updateLineAction: async (id, data) => {
    const updated = await writingApi.updateLine(id, data);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) => l.id === id ? { ...l, ...updated } : l),
        })),
      } : null,
    }));
  },

  deleteLineAction: async (id) => {
    await writingApi.deleteLine(id);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).filter((l) => l.id !== id),
        })),
      } : null,
    }));
  },

  createNodeAction: async (lineId, title = "", summary = "", purpose = "", startCh?: number, endCh?: number) => {
    const node = await writingApi.createNode(lineId, title, summary, purpose, undefined, startCh, endCh);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) =>
            l.id === lineId ? { ...l, nodes: [...(l.nodes || []), { ...node, beats: [] }] } : l
          ),
        })),
      } : null,
    }));
    return node;
  },

  updateNodeAction: async (id, data) => {
    const updated = await writingApi.updateNode(id, data);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) => ({
            ...l,
            nodes: (l.nodes || []).map((n) => n.id === id ? { ...n, ...updated } : n),
          })),
        })),
      } : null,
    }));
  },

  deleteNodeAction: async (id) => {
    await writingApi.deleteNode(id);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) => ({
            ...l,
            nodes: (l.nodes || []).filter((n) => n.id !== id),
          })),
        })),
      } : null,
    }));
  },

  createBeatAction: async (nodeId, kind = "action" as const, summary = "") => {
    const beat = await writingApi.createBeat(nodeId, kind, summary);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) => ({
            ...l,
            nodes: (l.nodes || []).map((n) =>
              n.id === nodeId ? { ...n, beats: [...(n.beats || []), beat] } : n
            ),
          })),
        })),
      } : null,
    }));
    return beat;
  },

  updateBeatAction: async (id, data) => {
    const updated = await writingApi.updateBeat(id, data);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) => ({
            ...l,
            nodes: (l.nodes || []).map((n) => ({
              ...n,
              beats: (n.beats || []).map((b) => b.id === id ? { ...b, ...updated } : b),
            })),
          })),
        })),
      } : null,
    }));
  },

  deleteBeatAction: async (id) => {
    await writingApi.deleteBeat(id);
    set((s) => ({
      plotTree: s.plotTree ? {
        ...s.plotTree,
        arcs: (s.plotTree.arcs || []).map((a) => ({
          ...a,
          lines: (a.lines || []).map((l) => ({
            ...l,
            nodes: (l.nodes || []).map((n) => ({
              ...n,
              beats: (n.beats || []).filter((b) => b.id !== id),
            })),
          })),
        })),
      } : null,
    }));
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
