import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { SquarePen, Trash2, Plus, ChevronDown } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingThread, WritingThreadNode, WritingScene, CodexEntry } from "../../api/writing";
import { SceneEditor } from "./SceneEditor";

// ── Node type config ──

const NODE_META: Record<
  WritingThreadNode["type"],
  { label: string; color: string }
> = {
  advance: { label: "推进", color: "#94a3b8" },
  surface: { label: "浮现", color: "#60a5fa" },
  resolve: { label: "收束", color: "#4ade80" },
  background: { label: "背景", color: "#a78bfa" },
};

// ── Show filter config ──

const SHOW_OPTIONS = [
  { id: "threads", label: "叙事线" },
  { id: "character", label: "角色" },
  { id: "location", label: "地点" },
  { id: "lore", label: "设定" },
  { id: "object", label: "物品" },
] as const;

type ShowFilter = (typeof SHOW_OPTIONS)[number]["id"];

// ── Types ──

interface FlatScene {
  id: string;
  actId: string;
  actTitle: string;
  chapterId: string;
  chapterTitle: string;
  scene: WritingScene;
  sceneIndex: number;
  chapterSceneIndex: number;
  isNewAct: boolean;
  isNewChapter: boolean;
}

// ── Main Component ──

export function PlanMatrixView() {
  const acts = useWritingStore((s) => s.acts);
  const threads = useWritingStore((s) => s.threads);
  const threadNodes = useWritingStore((s) => s.threadNodes);
  const codexEntries = useWritingStore((s) => s.codexEntries);
  const createThreadNodeAction = useWritingStore((s) => s.createThreadNodeAction);
  const deleteThreadNodeAction = useWritingStore((s) => s.deleteThreadNodeAction);
  const updateThreadNodeAction = useWritingStore((s) => s.updateThreadNodeAction);
  const setActiveScene = useWritingStore((s) => s.setActiveScene);
  const setWritingViewTab = useWritingStore((s) => s.setWritingViewTab);

  const [showFilter, setShowFilter] = useState<ShowFilter>("threads");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Flatten scene hierarchy
  const scenes: FlatScene[] = useMemo(() => {
    const result: FlatScene[] = [];
    let lastActId = "";
    let lastChapterId = "";
    let sceneIdx = 0;
    let chapterSceneIdx = 0;
    for (const act of acts) {
      for (const ch of (act as any).chapters || []) {
        chapterSceneIdx = 0;
        for (const sc of ch.scenes || []) {
          const isNewAct = act.id !== lastActId;
          const isNewChapter = ch.id !== lastChapterId;
          result.push({
            id: sc.id,
            actId: act.id,
            actTitle: act.title || `Act ${(act.sort_order ?? 0) + 1}`,
            chapterId: ch.id,
            chapterTitle: ch.title || `Ch ${(ch.sort_order ?? 0) + 1}`,
            scene: sc,
            sceneIndex: sceneIdx++,
            chapterSceneIndex: chapterSceneIdx++,
            isNewAct,
            isNewChapter,
          });
          lastActId = act.id;
          lastChapterId = ch.id;
        }
      }
    }
    return result;
  }, [acts]);

  // Thread node map: scene_id → thread_id → node
  const nodeMap = useMemo(() => {
    const m = new Map<string, Map<string, WritingThreadNode>>();
    for (const thread of threads) {
      const nodes = threadNodes[thread.id] || [];
      for (const node of nodes) {
        if (!node.scene_id) continue;
        if (!m.has(node.scene_id)) m.set(node.scene_id, new Map());
        m.get(node.scene_id)!.set(thread.id, node);
      }
    }
    return m;
  }, [threads, threadNodes]);

  // Filtered codex entries
  const filteredCodex = useMemo(() => {
    if (showFilter === "threads") return [];
    return codexEntries.filter((e) => e.type === showFilter);
  }, [showFilter, codexEntries]);

  // Columns
  const columns = useMemo(() => {
    if (showFilter === "threads") {
      return threads.map((t) => ({
        id: t.id,
        name: t.name || "未命名",
        color: t.color,
        subtitle: t.type === "main" ? "主线" : t.type === "subplot" ? "支线" : "暗线",
      }));
    }
    return filteredCodex.map((e) => ({
      id: e.id,
      name: e.name || "未命名",
      color: "#6b7280",
      subtitle: "",
    }));
  }, [showFilter, threads, filteredCodex]);

  // Codex presence map: scene_id → Set<codex_id> (which codex entries this scene is associated with)
  const codexPresenceMap = useMemo(() => {
    if (showFilter === "threads") return new Map<string, Set<string>>();
    const m = new Map<string, Set<string>>();
    for (const fs of scenes) {
      const associated = new Set<string>();
      // Method 1: explicit codex_ids on scene
      const codexIds: string[] = (() => {
        try { return Array.isArray(fs.scene.codex_ids) ? fs.scene.codex_ids : JSON.parse(fs.scene.codex_ids || "[]"); }
        catch { return []; }
      })();
      for (const id of codexIds) associated.add(id);
      // Method 2: auto-detect from summary (codex name/alias appears in text)
      const summary = (fs.scene.summary || "").toLowerCase();
      const content = (() => {
        try {
          const doc = JSON.parse(fs.scene.content);
          const texts: string[] = [];
          const walk = (n: any) => { if (n.text) texts.push(n.text); if (n.content) n.content.forEach(walk); };
          walk(doc);
          return texts.join("").toLowerCase();
        } catch { return ""; }
      })();
      const combined = summary + " " + content;
      for (const entry of filteredCodex) {
        if (associated.has(entry.id)) continue;
        const names = [entry.name, ...(entry.aliases || [])].filter(Boolean).map(n => n.toLowerCase());
        for (const name of names) {
          if (name.length >= 2 && combined.includes(name)) {
            associated.add(entry.id);
            break;
          }
        }
      }
      if (associated.size > 0) m.set(fs.id, associated);
    }
    return m;
  }, [scenes, filteredCodex]);

  // Handlers
  const handleAddNode = useCallback(async (threadId: string, sceneId: string) => {
    await createThreadNodeAction(threadId, "advance", "", sceneId);
  }, [createThreadNodeAction]);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    await deleteThreadNodeAction(nodeId);
  }, [deleteThreadNodeAction]);

  const handleOpenInManuscript = useCallback((sceneId: string) => {
    setActiveScene(sceneId);
    setWritingViewTab("write");
  }, [setActiveScene, setWritingViewTab]);

  // Stats
  const totalNodes = useMemo(() => {
    let count = 0;
    for (const thread of threads) {
      count += (threadNodes[thread.id] || []).filter((n) => n.scene_id).length;
    }
    return count;
  }, [threads, threadNodes]);

  if (scenes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        暂无场景，无法显示矩阵
      </div>
    );
  }

  const isThreadsMode = showFilter === "threads";
  const noData = isThreadsMode
    ? threads.length === 0
    : filteredCodex.length === 0;

  const colWidth = isThreadsMode ? 220 : 260;
  const labelWidth = 180;
  const currentShow = SHOW_OPTIONS.find((o) => o.id === showFilter)!;

  return (
    <div className="flex flex-col h-full select-none">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-1 pb-2 shrink-0">
        <span className="text-[11px] text-zinc-500">显示：</span>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 cursor-pointer hover:bg-zinc-700/80 transition-colors"
          >
            {currentShow.label}
            <ChevronDown className="size-3 opacity-60" />
          </button>
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-30 py-1 min-w-[120px]">
              {SHOW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setShowFilter(opt.id); setDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${
                    showFilter === opt.id
                      ? "text-zinc-100 bg-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40"
                  }`}
                >
                  {opt.label}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-600 tabular-nums">
          {isThreadsMode
            ? `${threads.length} 线 · ${totalNodes} 节点 · ${scenes.length} 场景`
            : `${filteredCodex.length} 条目 · ${scenes.length} 场景`}
        </span>
      </div>

      {noData && (
        <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
          {isThreadsMode ? "暂无叙事线，添加后可查看矩阵" : `暂无${currentShow.label}类型的世界观条目`}
        </div>
      )}

      {/* ── Excel-style Matrix Grid ── */}
      {!noData && (
      <div className="flex-1 overflow-auto">
        <table
          className="border-collapse"
          style={{ minWidth: labelWidth + columns.length * colWidth + 16 }}
        >
          {/* ── Column Headers ── */}
          <thead>
            <tr>
              <th
                className="sticky top-0 z-20 bg-[#18181b] border border-zinc-700/50 text-left align-bottom px-3 py-2"
                style={{ width: labelWidth, minWidth: labelWidth }}
              />
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="sticky top-0 z-20 bg-[#18181b] border border-zinc-700/50 text-left align-bottom px-3 py-2"
                  style={{ width: colWidth, minWidth: colWidth }}
                >
                  <span className="text-[13px] font-medium text-zinc-300 truncate block" style={{ color: col.color }}>
                    {col.name}
                  </span>
                  {col.subtitle && (
                    <span className="text-[10px] text-zinc-600">{col.subtitle}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Scene Rows ── */}
          <tbody>
            {scenes.map((fs) => {
              const sceneNodes = nodeMap.get(fs.id);
              return (
                <tr key={fs.id} className="group">
                  {/* ── Left Label Column ── */}
                  <td
                    className="border border-zinc-700/50 px-3 py-2 align-top bg-[#141418]"
                    style={{ width: labelWidth, minWidth: labelWidth }}
                  >
                    {fs.isNewAct && (
                      <div className="text-[16px] font-bold text-zinc-200 mb-0.5 mt-2 first:mt-0">
                        {fs.actTitle}
                      </div>
                    )}
                    {fs.isNewChapter && (
                      <div className="text-[13px] font-semibold text-zinc-300 mb-1">
                        {fs.chapterTitle}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-stone-400">
                        Scene {fs.chapterSceneIndex + 1}
                      </span>
                      <button
                        onClick={() => handleOpenInManuscript(fs.id)}
                        className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 cursor-pointer"
                        title="在编辑器中打开"
                      >
                        <SquarePen className="size-3" />
                      </button>
                    </div>
                  </td>

                  {/* ── Data Cells ── */}
                  {columns.map((col) => {
                    if (isThreadsMode) {
                      const node = sceneNodes?.get(col.id);
                      return (
                        <MatrixThreadCell
                          key={`${fs.id}-${col.id}`}
                          thread={threads.find((t) => t.id === col.id)!}
                          node={node ?? null}
                          sceneId={fs.id}
                          onAdd={handleAddNode}
                          onDelete={handleDeleteNode}
                          onUpdate={updateThreadNodeAction}
                        />
                      );
                    }
                    const presence = codexPresenceMap.get(fs.id);
                    const hasAssociation = presence?.has(col.id) ?? false;
                    return (
                      <MatrixCodexCell
                        key={`${fs.id}-${col.id}`}
                        scene={fs.scene}
                        codexEntry={filteredCodex.find((e) => e.id === col.id) ?? null}
                        hasAssociation={hasAssociation}
                        onOpenInManuscript={handleOpenInManuscript}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// ── Thread Cell ──

function MatrixThreadCell({
  thread,
  node,
  sceneId,
  onAdd,
  onDelete,
  onUpdate,
}: {
  thread: WritingThread;
  node: WritingThreadNode | null;
  sceneId: string;
  onAdd: (threadId: string, sceneId: string) => Promise<void>;
  onDelete: (nodeId: string) => Promise<void>;
  onUpdate: (id: string, data: Partial<WritingThreadNode>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (node && !node.title && !editing) {
      setEditing(true);
      setDraft("");
    }
  }, [node?.id, node?.title]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleStartEdit = useCallback(() => {
    if (!node) return;
    setDraft(node.title);
    setEditing(true);
  }, [node]);

  const handleCommit = useCallback(() => {
    if (!node) return;
    if (draft !== node.title) onUpdate(node.id, { title: draft });
    setEditing(false);
  }, [node, draft, onUpdate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLElement).blur();
    else if (e.key === "Escape") { setDraft(node?.title || ""); setEditing(false); }
  }, [node]);

  if (!node) {
    return (
      <td className="border border-zinc-700/50 px-1 py-1" style={{ minHeight: 56 }}>
        <button
          onClick={() => onAdd(thread.id, sceneId)}
          className="text-[12px] text-zinc-400 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity px-1.5 py-1 rounded cursor-pointer hover:bg-white/5 h-full w-full flex items-center justify-center"
        >
          <Plus className="size-3 inline -mt-0.5 mr-0.5" />
          添加节点
        </button>
      </td>
    );
  }

  const meta = NODE_META[node.type];
  const isGoal = node.goal;

  return (
    <td
      className="border border-zinc-700/50 px-2 py-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="rounded border transition-colors"
        style={{
          borderColor: hovered ? `${thread.color}40` : "rgba(82, 82, 91, 0.5)",
          backgroundColor: hovered ? `${thread.color}08` : "transparent",
          borderStyle: isGoal ? "dashed" : undefined,
          opacity: isGoal ? 0.75 : 1,
        }}
      >
        <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
          >
            {meta.label}
          </span>
          {isGoal && (
            <span className="text-[9px] text-zinc-500 font-medium">目标</span>
          )}
          {hovered && (
            <div className="flex items-center gap-0.5 ml-auto">
              <button onClick={handleStartEdit} className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer" title="编辑标题">
                <SquarePen className="size-3" />
              </button>
              <button onClick={() => onDelete(node.id)} className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer" title="删除节点">
                <Trash2 className="size-3" />
              </button>
            </div>
          )}
        </div>
        <div className="px-2 pb-1.5">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleCommit}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-[13px] text-zinc-300 outline-none placeholder:text-zinc-600"
              placeholder="节点标题…"
            />
          ) : (
            <div onClick={handleStartEdit} className="text-[13px] text-zinc-300 cursor-text min-h-[20px] line-clamp-2">
              {node.title || <span className="text-zinc-600 italic">点击编辑…</span>}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}

// ── Codex Cell — same card as Grid, wrapped in td ──

function MatrixCodexCell({
  scene,
  codexEntry,
  hasAssociation,
  onOpenInManuscript,
}: {
  scene: WritingScene;
  codexEntry: CodexEntry | null;
  hasAssociation: boolean;
  onOpenInManuscript: (sceneId: string) => void;
}) {
  // Empty cell: no codex association
  if (!hasAssociation) {
    return (
      <td className="border border-zinc-700/50 px-1 py-1 bg-[#141418]">
        <button
          onClick={() => {
            const codexIds: string[] = (() => {
              try { return Array.isArray(scene.codex_ids) ? scene.codex_ids : JSON.parse(scene.codex_ids || "[]"); }
              catch { return []; }
            })();
            if (codexEntry) {
              useWritingStore.getState().patchScene(scene.id, { codex_ids: [...codexIds, codexEntry.id] } as any);
            }
          }}
          className="text-[12px] text-zinc-400 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity px-1.5 py-1 rounded cursor-pointer hover:bg-white/5 h-full w-full flex items-center justify-center"
        >
          <Plus className="size-3 inline -mt-0.5 mr-0.5" />
          添加关联
        </button>
      </td>
    );
  }

  // Associated cell: same card wrapper as Grid, with SceneEditor compact inside
  return (
    <td className="border border-zinc-700/50 p-1 align-top bg-[#141418]" style={{ minWidth: 280 }}>
      <div className="rounded bg-zinc-900 border border-zinc-600/50 shadow-sm flex min-w-0">
        <div className="grow flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-700/50 shrink-0">
            <span className="text-[11px] text-zinc-500 font-medium">
              Scene {(scene.sort_order ?? 0) + 1}
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => onOpenInManuscript(scene.id)}
                className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
                title="在编辑器中打开"
                type="button"
              >
                <SquarePen size={12} />
              </button>
            </div>
          </div>
          <SceneEditor scene={scene} compact />
        </div>
      </div>
    </td>
  );
}
