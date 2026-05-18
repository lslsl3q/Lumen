/**
 * WritingMode — 写作模式主组件
 *
 * 布局结构（写作模式）：
 *   WritingSidebar（左） | 主内容区（右）
 *   主内容区顶部：Plan | Write | Chat | Review（四个 tabs）
 *   主内容区下方：Write→WritingEditor / Plan→PlanView
 */
import { useState, useEffect, Component } from "react";
import { WritingSidebar } from "./writing/WritingSidebar";
import { WritingEditor } from "./writing/WritingEditor";
import { PlanView } from "./writing/PlanView";
import { useWritingStore } from "../stores/useWritingStore";
import { cn } from "../lib/utils";
import * as writingApi from "../api/writing";

type WritingView = "plan" | "write" | "chat" | "review";

const VIEW_TABS: { id: WritingView; label: string; disabled: boolean }[] = [
  { id: "plan", label: "Plan", disabled: true },
  { id: "write", label: "Write", disabled: false },
  { id: "chat", label: "Chat", disabled: true },
  { id: "review", label: "Review", disabled: true },
];

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full bg-surface-deep text-slate-400">
          <div className="text-center max-w-md">
            <p className="text-red-400 text-sm mb-2">写作模式渲染错误</p>
            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
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
  const { isChatPanelOpen, activeProjectId } = useWritingStore();
  const [viewMode, setViewMode] = useState<WritingView>("write");

  // 自动快照
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

        {/* 主内容区 */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* 顶部 tabs — 写作模式：Plan | Write | Chat | Review */}
          <div className="flex-none h-11 flex items-center px-3 border-b border-border-default bg-surface-deep gap-0.5">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setViewMode(tab.id)}
                disabled={tab.disabled}
                className={cn(
                  "text-xs font-semibold rounded px-3 py-1.5 transition-colors",
                  viewMode === tab.id
                    ? "bg-gray-800 text-stone-200"
                    : "bg-transparent text-stone-400 hover:text-stone-300",
                  tab.disabled && "opacity-40 pointer-events-none"
                )}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 内容 */}
          {viewMode === "write" ? (
            <WritingEditor>
              {isChatPanelOpen && (
                <div className="w-[380px] flex-shrink-0 border-l border-border-default flex items-center justify-center text-text-muted text-sm">
                  AI 面板（NC 研究后重写）
                </div>
              )}
            </WritingEditor>
          ) : (
            <PlanView />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
