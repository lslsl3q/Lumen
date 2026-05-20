import { useCallback, useState, useMemo } from "react";
import { SquarePen, Trash2, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingScene } from "../../api/writing";

interface FlatRow {
  actId: string;
  actTitle: string;
  actOrder: number;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  scene: WritingScene;
  wordCount: number;
}

function extractTextLength(content: unknown): number {
  if (!content) return 0;
  let text = "";
  const walk = (node: any) => {
    if (node.type === "text" && node.text) text += node.text;
    for (const child of node.content || []) walk(child);
  };
  if (typeof content === "string") {
    try { walk(JSON.parse(content)); } catch { text = content; }
  } else if (typeof content === "object") {
    walk(content);
  }
  return text.length;
}

function flattenActs(acts: any[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const act of acts) {
    for (const ch of act.chapters || []) {
      for (const sc of ch.scenes || []) {
        rows.push({
          actId: act.id,
          actTitle: act.title || `Act ${(act.sort_order ?? 0) + 1}`,
          actOrder: act.sort_order ?? 0,
          chapterId: ch.id,
          chapterTitle: ch.title || `Ch ${(ch.sort_order ?? 0) + 1}`,
          chapterOrder: ch.sort_order ?? 0,
          scene: sc,
          wordCount: extractTextLength(sc.content),
        });
      }
    }
  }
  return rows;
}

type SortKey = "act" | "chapter" | "scene" | "words";
const SORT_LABELS: Record<SortKey, string> = {
  act: "按卷排序",
  chapter: "按章节排序",
  scene: "按摘要排序",
  words: "按字数排序",
};

export function PlanMatrixView() {
  const acts = useWritingStore((s) => s.acts);
  const [sortKey, setSortKey] = useState<SortKey>("act");
  const [editedSummary, setEditedSummary] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const flat = flattenActs(acts as any[]);
    const sorted = [...flat];
    switch (sortKey) {
      case "act":
        return sorted.sort((a, b) => a.actOrder - b.actOrder || a.chapterOrder - b.chapterOrder || (a.scene.sort_order ?? 0) - (b.scene.sort_order ?? 0));
      case "chapter":
        return sorted.sort((a, b) => a.chapterTitle.localeCompare(b.chapterTitle) || (a.scene.sort_order ?? 0) - (b.scene.sort_order ?? 0));
      case "scene":
        return sorted.sort((a, b) => (a.scene.summary || "").localeCompare(b.scene.summary || ""));
      case "words":
        return sorted.sort((a, b) => b.wordCount - a.wordCount);
      default:
        return sorted;
    }
  }, [acts, sortKey]);

  const totalScenes = rows.length;
  const totalWords = rows.reduce((s, r) => s + r.wordCount, 0);

  const handleSummaryBlur = useCallback((sceneId: string, sceneSummary: string) => {
    const edited = editedSummary[sceneId];
    if (edited !== undefined && edited !== sceneSummary) {
      useWritingStore.getState().updateSceneAction(sceneId, { summary: edited });
      setEditedSummary((prev) => {
        const next = { ...prev };
        delete next[sceneId];
        return next;
      });
    }
  }, [editedSummary]);

  const handleOpen = useCallback((sceneId: string) => {
    useWritingStore.getState().setActiveScene(sceneId);
    useWritingStore.getState().setWritingViewTab("write");
  }, []);

  const handleDelete = useCallback(async (sceneId: string) => {
    await useWritingStore.getState().deleteSceneAction(sceneId);
  }, []);

  let lastActId = "";
  let lastChapterId = "";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 transition-colors cursor-pointer">
            <ArrowUpDown className="size-3.5" />
            {SORT_LABELS[sortKey]}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <DropdownMenuItem key={key} onClick={() => setSortKey(key)}>
                {SORT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--color-text-dim)] tabular-nums">
          {totalScenes} 场景 / {totalWords.toLocaleString()} 字
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-zinc-700">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-zinc-800 border-b border-zinc-700">
            <tr>
              <th className="px-3 py-2 font-semibold text-zinc-400 w-[120px]">Act</th>
              <th className="px-3 py-2 font-semibold text-zinc-400 w-[140px]">Chapter</th>
              <th className="px-3 py-2 font-semibold text-zinc-400 w-[40px] text-center">#</th>
              <th className="px-3 py-2 font-semibold text-zinc-400">Summary</th>
              <th className="px-3 py-2 font-semibold text-zinc-400 w-[64px] text-right">Words</th>
              <th className="px-3 py-2 font-semibold text-zinc-400 w-[52px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isNewAct = row.actId !== lastActId;
              const isNewChapter = row.chapterId !== lastChapterId;
              lastActId = row.actId;
              lastChapterId = row.chapterId;

              const summary = editedSummary[row.scene.id] ?? (row.scene.summary || "");

              return (
                <tr
                  key={row.scene.id}
                  className={`border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors ${isNewAct ? "border-t-2 border-t-zinc-600" : ""}`}
                >
                  <td className={`px-3 py-2 align-top whitespace-nowrap ${!isNewAct ? "text-zinc-600" : "text-zinc-400"}`}>
                    {isNewAct ? row.actTitle : ""}
                  </td>
                  <td className={`px-3 py-2 align-top whitespace-nowrap ${!isNewChapter ? "text-zinc-600" : "text-zinc-400"}`}>
                    {isNewChapter ? row.chapterTitle : ""}
                  </td>
                  <td className="px-3 py-2 text-center text-zinc-500 tabular-nums">
                    {(row.scene.sort_order ?? 0) + 1}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={summary}
                      onChange={(e) => setEditedSummary((prev) => ({ ...prev, [row.scene.id]: e.target.value }))}
                      onBlur={() => handleSummaryBlur(row.scene.id, row.scene.summary || "")}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      className="w-full bg-transparent text-zinc-300 text-[13px] outline-none placeholder:text-zinc-600"
                      placeholder="场景摘要…"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">
                    {row.wordCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5 opacity-40 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpen(row.scene.id)}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer"
                        title="在编辑器中打开"
                      >
                        <SquarePen className="size-3.5" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer">
                          <Trash2 className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row.scene.id)}>
                            <Trash2 className="size-3.5" />
                            删除场景
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  暂无场景数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
