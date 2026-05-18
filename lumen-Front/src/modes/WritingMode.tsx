/**
 * WritingMode — 写作模式主组件
 *
 * 写作模式使用独立布局，不通过 ActivityBar + SidePanel。
 * 布局结构：WritingSidebar（折叠/展开） + WritingEditor（主编辑区）。
 * 设定面板（人物/地点/世界/物品/大纲/导出/作品管理）为居中模态弹窗。
 */
import { useState, useEffect, Component } from "react";
import { WritingSidebar } from "./writing/WritingSidebar";
import { WritingEditor } from "./writing/WritingEditor";
import { PlanView } from "./writing/PlanView";
import { SnapshotPanel } from "./writing/SnapshotPanel";
import { useWritingStore } from "../stores/useWritingStore";
import * as writingApi from "../api/writing";

type WritingPanelType = "chapters" | "snapshots" | "chat" | "project" | "characters" | "locations" | "world" | "items" | "outline" | "export";

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

  const [activePanel, setActivePanel] = useState<WritingPanelType | null>(null);
  const [viewMode, setViewMode] = useState<"write" | "plan">("write");

  // 自动快照：每 15 分钟检查 contentDirty 后触发
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
        <WritingSidebar viewMode={viewMode} onViewModeChange={setViewMode} />

        <div className="flex flex-1 min-w-0 h-full">
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

      {/* 快照面板 */}
      {activePanel === "snapshots" && (
        <SnapshotPanel onClose={() => setActivePanel(null)} />
      )}
    </ErrorBoundary>
  );
}
