import { create } from "zustand";
import type { WritingProject, WritingAct, ManuscriptAct, ManuscriptChapter, WritingChapter, WritingScene, CodexEntry, WritingSnapshot, WritingSnippet, WritingLabel, WritingThread, WritingThreadNode, WritingChatThread } from "../api/writing";
import * as writingApi from "../api/writing";

export type AiMode = "chat" | "continue" | "rewrite" | "expand" | "condense" | "beat_generate";

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
  threads: WritingThread[];
  threadNodes: Record<string, WritingThreadNode[]>;
  manuscriptFilter: { type: "all" } | { type: "act"; id: string } | { type: "chapter"; id: string };
  setManuscriptFilter: (filter: WritingState["manuscriptFilter"]) => void;

  // Plan view state
  planViewMode: "grid" | "outline" | "matrix" | "threads";
  setPlanViewMode: (mode: WritingState["planViewMode"]) => void;
  writingViewTab: "plan" | "write" | "chat" | "review";
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
  // Threads
  loadThreads: (projectId: string) => Promise<void>;
  createThread: (type?: WritingThread["type"], name?: string, color?: string) => Promise<WritingThread>;
  updateThreadAction: (id: string, data: Partial<WritingThread>) => Promise<void>;
  deleteThreadAction: (id: string) => Promise<void>;
  loadThreadNodes: (threadId: string) => Promise<void>;
  createThreadNodeAction: (threadId: string, type?: WritingThreadNode["type"], title?: string, sceneId?: string | null) => Promise<WritingThreadNode>;
  updateThreadNodeAction: (id: string, data: Partial<WritingThreadNode>) => Promise<void>;
  deleteThreadNodeAction: (id: string) => Promise<void>;

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
  typewriterMode: false,
  saveStatus: "saved",
  lastSavedAt: null,
  contentDirty: false,
  snapshots: [],
  snippets: [],
  activeSnippetId: null,
  labels: [],
  manuscriptFilter: { type: "all" },
  threads: [],
  threadNodes: {},
  planViewMode: "outline",
  writingViewTab: "write",
  showPromptManager: false,
  showSettingsPanel: false,
  settingsPanelTab: "metadata",
  ghostTextContent: "",
  ghostRequestId: null,

  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
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
    set({ activeProjectId: id, acts: [], activeSceneId: null, codexEntries: [], threads: [], threadNodes: {}, chatThreads: [], activeThreadId: null, chatPanelMode: "none" });
    if (id) {
      await get().loadManuscript(id);
      await get().loadCodex(id);
      await get().loadThreads(id);
      await get().loadChatThreads(id);
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

  // ── Threads ──

  loadThreads: async (projectId) => {
    const threads = await writingApi.listThreads(projectId);
    set({ threads });
    // 自动加载每条线的节点
    for (const t of threads) {
      const nodes = await writingApi.listThreadNodes(t.id);
      set((s) => ({ threadNodes: { ...s.threadNodes, [t.id]: nodes } }));
    }
  },

  createThread: async (type = "dark", name = "", color = "#6b7280") => {
    const { activeProjectId } = get();
    if (!activeProjectId) throw new Error("No active project");
    const thread = await writingApi.createThread(activeProjectId, type, name, color);
    set((s) => ({
      threads: [...s.threads, thread],
      threadNodes: { ...s.threadNodes, [thread.id]: [] },
    }));
    return thread;
  },

  updateThreadAction: async (id, data) => {
    const updated = await writingApi.updateThread(id, data);
    set((s) => ({ threads: s.threads.map((t) => t.id === id ? updated : t) }));
  },

  deleteThreadAction: async (id) => {
    await writingApi.deleteThread(id);
    set((s) => {
      const { [id]: _, ...rest } = s.threadNodes;
      return { threads: s.threads.filter((t) => t.id !== id), threadNodes: rest };
    });
  },

  loadThreadNodes: async (threadId) => {
    const nodes = await writingApi.listThreadNodes(threadId);
    set((s) => ({ threadNodes: { ...s.threadNodes, [threadId]: nodes } }));
  },

  createThreadNodeAction: async (threadId, type = "advance", title = "", sceneId = null) => {
    const node = await writingApi.createThreadNode(threadId, type, title, "", sceneId);
    set((s) => ({
      threadNodes: {
        ...s.threadNodes,
        [threadId]: [...(s.threadNodes[threadId] || []), node],
      },
    }));
    return node;
  },

  updateThreadNodeAction: async (id, data) => {
    const updated = await writingApi.updateThreadNode(id, data);
    set((s) => ({
      threadNodes: Object.fromEntries(
        Object.entries(s.threadNodes).map(([tid, nodes]) => [
          tid,
          nodes.map((n) => n.id === id ? updated : n),
        ]),
      ),
    }));
  },

  deleteThreadNodeAction: async (id) => {
    // 找到节点所属的 thread
    const { threadNodes } = get();
    let targetThreadId: string | null = null;
    for (const [tid, nodes] of Object.entries(threadNodes)) {
      if (nodes.some((n) => n.id === id)) { targetThreadId = tid; break; }
    }
    await writingApi.deleteThreadNode(id);
    if (targetThreadId) {
      set((s) => ({
        threadNodes: {
          ...s.threadNodes,
          [targetThreadId]: (s.threadNodes[targetThreadId] || []).filter((n) => n.id !== id),
        },
      }));
    }
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
}));
