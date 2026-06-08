import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { SquarePen, Plus, ChevronDown } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingScene, CodexEntry } from "../../api/writing";
import { SceneEditor } from "./SceneEditor";

// ── Show filter config ──

const SHOW_OPTIONS = [
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
  const codexEntries = useWritingStore((s) => s.codexEntries);
  const setActiveScene = useWritingStore((s) => s.setActiveScene);
  const setWritingViewTab = useWritingStore((s) => s.setWritingViewTab);

  const [showFilter, setShowFilter] = useState<ShowFilter>("character");
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

  // Filtered codex entries
  const filteredCodex = useMemo(() => {
    return codexEntries.filter((e) => e.type === showFilter);
  }, [showFilter, codexEntries]);

  // Columns
  const columns = useMemo(() => {
    return filteredCodex.map((e) => ({
      id: e.id,
      name: e.name || "未命名",
      color: "#6b7280",
      subtitle: "",
    }));
  }, [filteredCodex]);

  // Codex presence map: scene_id → Set<codex_id>
  const codexPresenceMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const fs of scenes) {
      const associated = new Set<string>();
      const codexIds: string[] = (() => {
        try { return Array.isArray(fs.scene.codex_ids) ? fs.scene.codex_ids : JSON.parse(fs.scene.codex_ids || "[]"); }
        catch { return []; }
      })();
      for (const id of codexIds) associated.add(id);
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

  const handleOpenInManuscript = useCallback((sceneId: string) => {
    setActiveScene(sceneId);
    setWritingViewTab("write");
  }, [setActiveScene, setWritingViewTab]);

  if (scenes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        暂无场景，无法显示矩阵
      </div>
    );
  }

  const noData = filteredCodex.length === 0;
  const colWidth = 260;
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
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-600 tabular-nums">
          {filteredCodex.length} 条目 · {scenes.length} 场景
        </span>
      </div>

      {noData && (
        <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
          {`暂无${currentShow.label}类型的世界观条目`}
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
                className="sticky top-0 z-20 bg-surface-deep border border-zinc-700/50 text-left align-bottom px-3 py-2"
                style={{ width: labelWidth, minWidth: labelWidth }}
              />
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="sticky top-0 z-20 bg-surface-deep border border-zinc-700/50 text-left align-bottom px-3 py-2"
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
            {scenes.map((fs) => (
              <tr key={fs.id} className="group">
                {/* ── Left Label Column ── */}
                <td
                  className="border border-zinc-700/50 px-3 py-2 align-top bg-surface-deep"
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

                {/* ── Codex Cells ── */}
                {columns.map((col) => {
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
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// ── Codex Cell ──

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
  if (!hasAssociation) {
    return (
      <td className="border border-zinc-700/50 px-1 py-1 bg-surface-deep">
        <button
          onClick={() => {
            const codexIds: string[] = (() => {
              try { return Array.isArray(scene.codex_ids) ? scene.codex_ids : JSON.parse(scene.codex_ids || "[]"); }
              catch { return []; }
            })();
            if (codexEntry) {
              useWritingStore.getState().patchScene(scene.id, { codex_ids: [...codexIds, codexEntry.id] });
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

  return (
    <td className="border border-zinc-700/50 p-1 align-top bg-surface-deep" style={{ minWidth: 280 }}>
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
