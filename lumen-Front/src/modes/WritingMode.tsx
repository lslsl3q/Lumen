/**
 * WritingMode — 写作模式主组件
 *
 * WritingEditor 内部布局：工具栏（全宽）→ 中间行（纸张 + 侧面板）→ 状态栏（全宽）。
 * 侧面板（章节/AI聊天/图标条）作为 children 注入，只在中间行展开，不挤压上下栏。
 * 设定面板（人物/地点/世界/物品/大纲/导出/作品管理）为居中模态弹窗。
 */
import { useState, useEffect, Component } from "react";
import { WritingIconStrip, type WritingPanelType } from "./writing/WritingIconStrip";
import { ChaptersSidePanel } from "./writing/ChaptersSidePanel";
import { WritingModalPanel } from "./writing/WritingModalPanel";
import { WritingEditor } from "./writing/WritingEditor";
import { AiWritingPanel } from "./writing/AiWritingPanel";
import { SnapshotPanel } from "./writing/SnapshotPanel";
import { useWritingStore } from "../stores/useWritingStore";
import * as writingApi from "../api/writing";

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
  const { isChatPanelOpen, toggleChatPanel, activeProjectId } = useWritingStore();

  const [activePanel, setActivePanel] = useState<WritingPanelType>(null);

  const handleTogglePanel = (panel: WritingPanelType) => {
    if (panel === "chat") {
      toggleChatPanel();
      return;
    }
    setActivePanel((prev) => (prev === panel ? null : panel));
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
        } catch {}
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [activeProjectId]);

  return (
    <ErrorBoundary>
      <div className="h-full w-full bg-surface-deep relative overflow-hidden">

        <WritingEditor>
          {/* 章节侧栏（从右侧展开） */}
          {activePanel === "chapters" && (
            <ChaptersSidePanel onClose={() => setActivePanel(null)} />
          )}

          {/* AI 聊天面板 */}
          {isChatPanelOpen && (
            <div className="w-[380px] flex-shrink-0 border-l border-border-default">
              <AiWritingPanel />
            </div>
          )}

          {/* 图标条（始终在最右侧） */}
          <WritingIconStrip activePanel={activePanel} onToggle={handleTogglePanel} />
        </WritingEditor>

        {/* 快照面板 */}
        {activePanel === "snapshots" && (
          <SnapshotPanel onClose={() => setActivePanel(null)} />
        )}

        {/* 模态弹窗 */}
        {isModal && (
          <WritingModalPanel panel={activePanel} onClose={() => setActivePanel(null)} />
        )}

      </div>
    </ErrorBoundary>
  );
}
