import { useMemo } from "react";
import { Plus, Upload, MoreHorizontal } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import { ScrollArea } from "../../components/ui/scroll-area";
import { PlanGridView } from "./PlanGridView";
import { PlanMatrixView } from "./PlanMatrixView";
import { PlanKanbanView } from "./PlanKanbanView";
import { ThreadListView } from "./ThreadListView";
import { PlotPanel } from "./plot/PlotPanel";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";

export function PlanView({ searchQuery = "" }: { searchQuery?: string }) {
  const planViewMode = useWritingStore((s) => s.planViewMode);
  const acts = useWritingStore((s) => s.acts);
  const createAct = useWritingStore((s) => s.createAct);

  const stats = useMemo(() => {
    let scenes = 0;
    let words = 0;
    for (const act of acts) {
      for (const ch of (act as any).chapters || []) {
        for (const sc of ch.scenes || []) {
          scenes++;
          words += sc.word_count || 0;
        }
      }
    }
    return { scenes, words };
  }, [acts]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-deep)]">
      <ScrollArea className="flex-1 plan-scroll-area">
        <div className={planViewMode === "grid" ? "p-4 pl-6" : planViewMode === "matrix" ? "p-3" : "p-4 max-w-4xl mx-auto"}>
          {/* outline key = NC Outline (tree view) */}
          {planViewMode === "outline" && <PlanGridView searchQuery={searchQuery} />}
          {/* grid key = NC Grid (kanban cards) */}
          {planViewMode === "grid" && <PlanKanbanView searchQuery={searchQuery} />}
          {planViewMode === "matrix" && <PlanMatrixView />}
          {planViewMode === "threads" && <ThreadListView />}
          {planViewMode === "plot" && <PlotPanel />}

          {/* Bottom action row — only for structure views */}
          {planViewMode !== "threads" && (
          <div className="flex gap-2 items-start mt-4">
            <button
              type="button"
              onClick={() => createAct("新卷")}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[12px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700/80 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              添加卷
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[12px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700/80 transition-colors cursor-pointer">
                <MoreHorizontal className="w-3 h-3" />
                操作
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <Upload className="w-3.5 h-3.5" />
                  导入
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex-1" />
            <span className="text-[11px] text-[var(--color-text-dim)] tabular-nums self-center">
              {stats.scenes} 场景 / {stats.words.toLocaleString()} 词
            </span>
          </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
