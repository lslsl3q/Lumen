/**
 * WritingMode — 写作模式主组件
 *
 * 布局：全宽编辑器底层（纸张始终居中于整个窗口），
 * 图标条/章节侧栏浮动在左侧，AI 面板浮动在右侧。
 * 设定面板（人物/地点/世界/物品/大纲/导出/作品管理）为居中模态弹窗。
 */
import { useState, Component } from "react";
import { WritingIconStrip, type WritingPanelType } from "./writing/WritingIconStrip";
import { ChaptersSidePanel } from "./writing/ChaptersSidePanel";
import { WritingModalPanel } from "./writing/WritingModalPanel";
import { WritingEditor } from "./writing/WritingEditor";
import { AiWritingPanel } from "./writing/AiWritingPanel";
import { useWritingStore } from "../stores/useWritingStore";

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full bg-[var(--color-bg-deep)] text-slate-400">
          <div className="text-center max-w-md">
            <p className="text-red-400 text-sm mb-2">写作模式渲染错误</p>
            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3 py-1 text-[11px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded hover:bg-[var(--color-primary)]/20 cursor-pointer"
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
  const { isChatPanelOpen, toggleChatPanel } = useWritingStore();

  const [activePanel, setActivePanel] = useState<WritingPanelType>(null);

  const handleTogglePanel = (panel: WritingPanelType) => {
    if (panel === "chat") {
      toggleChatPanel();
      return;
    }
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const isModal = activePanel ? MODAL_PANELS.includes(activePanel) : false;

  return (
    <ErrorBoundary>
      <div className="h-full w-full bg-[var(--color-bg-deep)] relative overflow-hidden flex">

        {/* 左侧：编辑器 + 章节侧栏 */}
        <div className="flex-1 relative overflow-hidden">
          {/* 全宽编辑器 */}
          <div className="absolute inset-0">
            <WritingEditor />
          </div>

          {/* 章节侧栏（从左边展开） */}
          {activePanel === "chapters" && (
            <ChaptersSidePanel onClose={() => setActivePanel(null)} />
          )}
        </div>

        {/* AI 聊天面板（由图标触发） */}
        {isChatPanelOpen && (
          <div className="w-[380px] flex-shrink-0 border-l border-[var(--color-border)]">
            <AiWritingPanel />
          </div>
        )}

        {/* 右侧：图标条 */}
        <WritingIconStrip activePanel={activePanel} onToggle={handleTogglePanel} />

        {/* 模态弹窗 */}
        {isModal && (
          <WritingModalPanel panel={activePanel} onClose={() => setActivePanel(null)} />
        )}

      </div>
    </ErrorBoundary>
  );
}
