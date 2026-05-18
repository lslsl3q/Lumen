/**
 * WritingMode — 写作模式主组件
 *
 * 写作模式使用独立布局，不通过 ActivityBar + SidePanel。
 * 布局结构：WritingSidebar（折叠/展开） + WritingEditor（主编辑区）。
 * 设定面板（人物/地点/世界/物品/大纲/导出/作品管理）为居中模态弹窗。
 */
import { useState, useEffect, Component } from "react";
import { WritingSidebar } from "./writing/WritingSidebar";
import { ChaptersSidePanel } from "./writing/ChaptersSidePanel";
import { WritingModalPanel } from "./writing/WritingModalPanel";
import { WritingEditor } from "./writing/WritingEditor";
import { PlanView } from "./writing/PlanView";
import { AiWritingPanel } from "./writing/AiWritingPanel";
import { SnapshotPanel } from "./writing/SnapshotPanel";
import { useWritingStore } from "../stores/useWritingStore";
import * as writingApi from "../api/writing";
import { getMigrationStatus, runMigration } from "../api/writing";

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

const MODAL_PANELS: WritingPanelType[] = ["project", "characters", "locations", "world", "items", "outline", "export"];

export default function WritingMode() {
  const { isChatPanelOpen, activeProjectId } = useWritingStore();

  const [activePanel, setActivePanel] = useState<WritingPanelType | null>(null);
  const [viewMode, setViewMode] = useState<"write" | "plan">("write");

  // 数据迁移状态
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (!activeProjectId) return;
    getMigrationStatus()
      .then((s) => {
        if (s.needs_migration) setMigrationNeeded(true);
      })
      .catch(() => {});
  }, [activeProjectId]);

  const handleRunMigration = async () => {
    setMigrating(true);
    try {
      const result = await runMigration();
      console.log("Migration complete:", result);
      setMigrationNeeded(false);
      // Reload manuscript to refresh UI
      await useWritingStore.getState().loadManuscript(activeProjectId!);
    } catch (e) {
      console.error("Migration failed:", e);
    } finally {
      setMigrating(false);
    }
  };

  const isModal = activePanel ? MODAL_PANELS.includes(activePanel) : false;

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
    <>
      {migrationNeeded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-elevated rounded-xl p-8 max-w-md text-center shadow-2xl border border-border-default">
            <h2 className="text-lg font-semibold text-text-primary mb-2">数据需要迁移</h2>
            <p className="text-sm text-text-muted mb-6">
              您的写作数据需要迁移到新的多编辑器格式。
              系统会自动创建迁移前备份。
            </p>
            <button
              className="px-6 py-2 rounded-lg bg-primary text-white hover:bg-primary/80 transition-colors disabled:opacity-50 cursor-pointer"
              disabled={migrating}
              onClick={handleRunMigration}
              type="button"
            >
              {migrating ? "迁移中..." : "开始迁移"}
            </button>
          </div>
        </div>
      )}
      <ErrorBoundary>
      <div className="flex h-full w-full overflow-hidden">
        <WritingSidebar />
        {/* View mode tabs */}
        <div className="flex items-center h-10 px-3 bg-surface-deep border-b border-border-default gap-2">
          <button
            className={`text-xs px-3 py-1 rounded cursor-pointer ${viewMode === "write" ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text-secondary"}`}
            onClick={() => setViewMode("write")}
          >
            Write
          </button>
          <button
            className={`text-xs px-3 py-1 rounded cursor-pointer ${viewMode === "plan" ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text-secondary"}`}
            onClick={() => setViewMode("plan")}
          >
            Plan
          </button>
        </div>

        {viewMode === "write" ? (
          <WritingEditor>
            {activePanel === "chapters" && (
              <ChaptersSidePanel onClose={() => setActivePanel(null)} />
            )}
            {isChatPanelOpen && (
              <div className="w-[380px] flex-shrink-0 border-l border-border-default">
                <AiWritingPanel />
              </div>
            )}
          </WritingEditor>
        ) : (
          <PlanView />
        )}
      </div>

      {/* 快照面板 */}
      {activePanel === "snapshots" && (
        <SnapshotPanel onClose={() => setActivePanel(null)} />
      )}

      {/* 模态弹窗 */}
      {isModal && activePanel && (
        <WritingModalPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      )}
    </ErrorBoundary>
    </>
  );
}
