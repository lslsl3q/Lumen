import { Component, useEffect, useState } from "react";
import { WritingSidebar } from "./writing/WritingSidebar";
import { WritingEditor } from "./writing/WritingEditor";
import { PlanView } from "./writing/PlanView";
import { PlotPanel } from "./writing/plot/PlotPanel";
import { ReviewView } from "./writing/ReviewView";
import { ChatView } from "./writing/ChatView";
import { FloatingChatPanel } from "./writing/FloatingChatPanel";
import { CodexDetailPanel } from "./writing/CodexDetailPanel";
import { PromptManagerView } from "./writing/prompt-manager/PromptManagerView";
import { ProjectSettingsPanel } from "./writing/ProjectSettingsPanel";
import { FormatPanel } from "./writing/FormatPanel";
import { CodexPreviewCard } from "./writing/CodexPreviewCard";
import { useWritingStore } from "../stores/useWritingStore";
import type { ManuscriptAct } from "../api/writing";
import { cn } from "../lib/utils";
import { Eye, PenLine, LayoutList, MessageCircle, FileCheck, ChevronDown, BookOpen, FileText, FolderTree, ListTree, Table2, Search, LayoutGrid, GitMerge } from "lucide-react";
import { Toggle } from "../components/ui/toggle";
import { Separator } from "../components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../components/ui/dropdown-menu";
import * as writingApi from "../api/writing";

const writingViewTabs = [
  { key: "plan" as const, icon: LayoutList, label: "计划", disabled: false },
  { key: "write" as const, icon: PenLine, label: "写", disabled: false },
  { key: "chat" as const, icon: MessageCircle, label: "聊天", disabled: false },
  { key: "review" as const, icon: FileCheck, label: "统计", disabled: false },
  { key: "plot" as const, icon: GitMerge, label: "剧情", disabled: false },
];

const PLAN_VIEWS = [
  { key: "grid" as const, label: "网格", icon: LayoutGrid },
  { key: "matrix" as const, label: "矩阵", icon: Table2 },
  { key: "outline" as const, label: "大纲", icon: ListTree },
];

function filterLabel(
  filter: { type: "act"; id: string } | { type: "chapter"; id: string },
  acts: ManuscriptAct[],
): string {
  if (filter.type === "act") {
    const act = acts.find((a) => a.id === filter.id);
    return act ? (act.title || `Act ${(act.sort_order ?? 0) + 1}`) : "整卷";
  }
  for (const act of acts) {
    const ch = act.chapters.find((c) => c.id === filter.id);
    if (ch) return ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`;
  }
  return "章节";
}

function SaveStatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-1.5 h-1.5 rounded-full flex-shrink-0",
        status === "saved" ? "bg-green-500" :
        status === "saving" ? "bg-yellow-500 animate-pulse" :
        "bg-gray-500"
      )}
      title={status}
    />
  );
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full bg-surface-deep text-text-secondary">
          <div className="text-center max-w-md">
            <p className="text-red-400 text-sm mb-2">写作模式渲染错误</p>
            <pre className="text-[11px] text-text-dim whitespace-pre-wrap break-all">{this.state.error.message}</pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3 py-1 text-[11px] bg-primary/10 text-primary rounded hover:bg-primary/20 cursor-pointer"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WritingMode() {
  const { activeProjectId } = useWritingStore();
  const activeCodexEntryId = useWritingStore((s) => s.activeCodexEntryId);
  const chatPanelMode = useWritingStore((s) => s.chatPanelMode);
  const activeThreadId = useWritingStore((s) => s.activeThreadId);
  const [planSearch, setPlanSearch] = useState("");
  const saveStatus = useWritingStore((s) => s.saveStatus);
  const focusMode = useWritingStore((s) => s.focusMode);
  const toggleFocusMode = useWritingStore((s) => s.toggleFocusMode);
  const acts = useWritingStore((s) => s.acts);
  const manuscriptFilter = useWritingStore((s) => s.manuscriptFilter);
  const setManuscriptFilter = useWritingStore((s) => s.setManuscriptFilter);
  const totalWords = acts.reduce((sum, act) => {
    return sum + ((act as any).chapters || []).reduce((cSum: number, ch: any) => {
      return cSum + (ch.scenes || []).reduce((sSum: number, sc: any) => sSum + (sc.word_count || 0), 0);
    }, 0);
  }, 0);
  const formatPrefs = useWritingStore((s) => s.formatPreferences);
  const readingMinutes = Math.max(1, Math.ceil(totalWords / (formatPrefs.readingSpeed || 200)));
  const pageCount = Math.max(1, Math.ceil(totalWords / (formatPrefs.wordsPerPage || 250)));
  const writingViewTab = useWritingStore((s) => s.writingViewTab);
  const setWritingViewTab = useWritingStore((s) => s.setWritingViewTab);
  const planViewMode = useWritingStore((s) => s.planViewMode);
  const setPlanViewMode = useWritingStore((s) => s.setPlanViewMode);
  const showPromptManager = useWritingStore((s) => s.showPromptManager);
  const setShowPromptManager = useWritingStore((s) => s.setShowPromptManager);
  const showSettingsPanel = useWritingStore((s) => s.showSettingsPanel);

  useEffect(() => {
    if (!activeProjectId) return;
    const timer = setInterval(async () => {
      const state = useWritingStore.getState();
      if (state.contentDirty && state.activeProjectId) {
        try {
          await writingApi.createSnapshot(state.activeProjectId, "自动快照", "auto");
          useWritingStore.setState({ contentDirty: false });
        } catch (e) {
          console.warn("[WritingMode] 自动快照失败:", e);
        }
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [activeProjectId]);

  return (
    <ErrorBoundary>
      <div className="flex h-full w-full overflow-hidden">
        <WritingSidebar />

        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Merged toolbar — tabs + format tools */}
          <div className="flex-none h-14 flex items-center px-3 border-b border-border-default bg-surface-deep">
            <div className="flex items-center gap-1">
              {writingViewTabs.map(({ key, icon: Icon, label, disabled }) => (
                <button
                  key={key}
                  onClick={() => { setWritingViewTab(key); setShowPromptManager(false); useWritingStore.getState().setShowSettingsPanel(false); }}
                  disabled={disabled}
                  className={cn(
                    "flex items-center gap-1 px-4 py-2 rounded-full text-[12px] font-semibold transition-colors",
                    writingViewTab === key
                      ? "bg-zinc-700 text-stone-100"
                      : "text-stone-400 hover:text-stone-200 hover:bg-white/5",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-zinc-600 mx-3" />

            {writingViewTab === "plan" ? (
              <>
                <div className="flex rounded-full border border-zinc-700 overflow-hidden">
                  {PLAN_VIEWS.map(({ key, label, icon: ViewIcon }, i) => (
                    <button
                      key={key}
                      onClick={() => setPlanViewMode(key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer",
                        planViewMode === key
                          ? "bg-zinc-500 text-zinc-100"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
                        i > 0 && "border-l border-zinc-700"
                      )}
                      type="button"
                    >
                      <ViewIcon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                {(planViewMode === "outline" || planViewMode === "grid") && (
                  <div className="ml-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-zinc-800 border border-zinc-700">
                    <Search className="w-3.5 h-3.5 text-zinc-500 flex-none" />
                    <input
                      className="w-36 bg-transparent text-[12px] text-zinc-300 outline-none placeholder:text-zinc-500"
                      placeholder="Search scenes..."
                      value={planSearch}
                      onChange={(e) => setPlanSearch(e.target.value)}
                    />
                  </div>
                )}
              </>
            ) : writingViewTab === "write" ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="ml-2 flex items-center gap-1.5 px-2.5 py-[7px] rounded text-[12px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/50 transition-colors cursor-pointer">
                  {manuscriptFilter.type === "all" ? "全部手稿" : filterLabel(manuscriptFilter, acts)}
                  <ChevronDown className="w-3.5 h-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => setManuscriptFilter({ type: "all" })}>
                    <BookOpen className="w-4 h-4" />
                    全部手稿
                  </DropdownMenuItem>
                  {acts.map((act) => {
                    const actNum = (act.sort_order ?? 0) + 1;
                    const actLabel = act.title || `Act ${actNum}`;
                    return (
                      <DropdownMenuSub key={act.id}>
                        <DropdownMenuSubTrigger>
                          <FolderTree className="w-4 h-4" />
                          {actLabel}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => setManuscriptFilter({ type: "act", id: act.id })}>
                            <BookOpen className="w-4 h-4" />
                            整卷
                          </DropdownMenuItem>
                          {act.chapters.map((ch) => (
                            <DropdownMenuItem
                              key={ch.id}
                              onClick={() => setManuscriptFilter({ type: "chapter", id: ch.id })}
                            >
                              <FileText className="w-4 h-4" />
                              {ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              {writingViewTab === "write" && !showPromptManager && !showSettingsPanel && (
                <>
                  <span className="text-[11px] text-text-muted tabular-nums">{totalWords} 词</span>
                  <span className="text-[11px] text-text-dim tabular-nums">{readingMinutes} 分钟</span>
                  <span className="text-[11px] text-text-dim tabular-nums">{pageCount} 页</span>
                  <SaveStatusDot status={saveStatus} />
                  <Separator orientation="vertical" className="h-3 mx-0.5" />
                  <FormatPanel />
                  <Toggle
                    size="sm"
                    pressed={focusMode}
                    onPressedChange={toggleFocusMode}
                    aria-label="专注模式"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Toggle>
                </>
              )}
            </div>
          </div>

          {showSettingsPanel ? (
            <ProjectSettingsPanel />
          ) : showPromptManager ? (
            <PromptManagerView />
          ) : writingViewTab === "write" ? (
            <WritingEditor>
              {chatPanelMode === "pinned" && activeThreadId && (
                <FloatingChatPanel />
              )}
            </WritingEditor>
          ) : writingViewTab === "chat" ? (
            <ChatView />
          ) : writingViewTab === "review" ? (
            <ReviewView />
          ) : writingViewTab === "plot" ? (
            <PlotPanel />
          ) : (
            <PlanView searchQuery={planSearch} />
          )}
        </div>
      </div>

      {activeCodexEntryId && <CodexDetailPanel />}
      <CodexPreviewCard />

      {/* Floating chat panel (only in write tab, floating mode) */}
      {writingViewTab === "write" && chatPanelMode === "floating" && activeThreadId && (
        <FloatingChatPanel />
      )}
    </ErrorBoundary>
  );
}
