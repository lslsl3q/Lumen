/**
 * WritingMode — 写作模式主组件
 *
 * 布局：全宽编辑器底层（纸张始终居中于整个窗口），
 * 图标条/章节侧栏浮动在左侧，AI 面板浮动在右侧。
 * 设定面板（人物/地点/世界/物品/大纲/导出/作品管理）为居中模态弹窗。
 */
import { useState, useRef, useCallback, useEffect, Component } from "react";
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
        <div className="flex items-center justify-center h-full bg-[#141413] text-slate-400">
          <div className="text-center max-w-md">
            <p className="text-red-400 text-sm mb-2">写作模式渲染错误</p>
            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3 py-1 text-[11px] bg-amber-400/10 text-amber-300 rounded hover:bg-amber-400/20 cursor-pointer"
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
  const { aiPanelWidth, setAiPanelWidth } = useWritingStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"ai" | null>(null);

  const [activePanel, setActivePanel] = useState<WritingPanelType>(null);

  const COLLAPSED_THRESHOLD = 80;
  const DEFAULT_WIDTH = 380;

  const onMouseMove = useCallback(
    (_e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (draggingRef.current === "ai") {
        const newWidth = Math.max(0, rect.right - _e.clientX);
        setAiPanelWidth(newWidth);
      }
    },
    [setAiPanelWidth],
  );

  const onMouseUp = useCallback(() => {
    if (draggingRef.current === "ai") {
      // 松手时：宽度小于阈值则收起为 0
      if (useWritingStore.getState().aiPanelWidth < COLLAPSED_THRESHOLD) {
        setAiPanelWidth(0);
      }
    }
    draggingRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [setAiPanelWidth]);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDrag = (target: "ai") => (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = target;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleTogglePanel = (panel: WritingPanelType) => {
    setActivePanel((prev) => prev === panel ? null : panel);
  };

  const isModal = activePanel ? MODAL_PANELS.includes(activePanel) : false;

  return (
    <ErrorBoundary>
    <div ref={containerRef} className="h-full w-full bg-[#141413] relative overflow-hidden">

      {/* 底层：全宽编辑器（纸张居中于整个窗口） */}
      <div className="absolute inset-0">
        <WritingEditor />
      </div>

      {/* 左侧：图标条（浮动） */}
      <WritingIconStrip activePanel={activePanel} onToggle={handleTogglePanel} />

      {/* 章节侧栏（挤压式，贴边） */}
      {activePanel === "chapters" && (
        <ChaptersSidePanel onClose={() => setActivePanel(null)} />
      )}

      {/* 模态弹窗（设定面板：居中 + 遮罩） */}
      {isModal && (
        <WritingModalPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      )}

      {/* 右侧：AI 面板（可拖拽宽度 / 可收起） */}
      {aiPanelWidth === 0 ? (
        /* 收起状态：右侧边缘小竖条 */
        <button
          onClick={() => setAiPanelWidth(DEFAULT_WIDTH)}
          className="absolute right-0 top-0 bottom-0 w-3 z-10 cursor-pointer flex items-center justify-center group"
        >
          <div className="w-0.5 h-10 rounded-full bg-[#2a2926] group-hover:bg-amber-400/50 group-hover:h-16 transition-all" />
        </button>
      ) : (
        /* 展开状态：拖拽手柄 + AI 面板 */
        <div className="absolute right-0 top-0 bottom-0 z-10 flex">
          <div
            onMouseDown={startDrag("ai")}
            className="w-2.5 flex-shrink-0 cursor-col-resize flex items-center justify-center group"
          >
            <div className="w-0.5 h-8 rounded-full bg-[#2a2926] group-hover:bg-amber-400/40 group-hover:h-12 transition-all" />
          </div>
          <div style={{ width: aiPanelWidth }} className="h-full">
            <AiWritingPanel />
          </div>
        </div>
      )}

    </div>
    </ErrorBoundary>
  );
}
