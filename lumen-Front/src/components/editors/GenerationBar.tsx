/**
 * GenerationBar — 通用 AI 生成状态条
 *
 * 解耦组件，被 Scene Beat / Continue Writing / 未来 AI 块复用。
 * 显示生成状态（转圈/按钮）和结果操作（Apply/Retry/Discard/Section）。
 */

interface GenerationBarProps {
  status: "generating" | "done";
  model: string;
  wordCount: number;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  onStop: () => void;
  onSection?: () => void;
}

export function GenerationBar({
  status,
  model,
  wordCount,
  onApply,
  onRetry,
  onDiscard,
  onStop,
  onSection,
}: GenerationBarProps) {
  return (
    <div className="generation-bar" contentEditable={false}>
      {status === "generating" ? (
        <div className="generation-bar-active">
          <span className="generation-bar-spinner" />
          <span className="generation-bar-text">正在生成...</span>
          <button
            onClick={onRetry}
            className="generation-bar-btn generation-bar-btn-secondary"
            title="重新生成"
          >
            ↻ Retry
          </button>
          <button
            onClick={onStop}
            className="generation-bar-btn generation-bar-btn-secondary"
            title="停止生成"
          >
            ⏹ 停止
          </button>
        </div>
      ) : (
        <div className="generation-bar-done">
          <div className="generation-bar-actions">
            <button
              onClick={onApply}
              className="generation-bar-btn generation-bar-btn-primary"
              title="接受生成内容"
            >
              ✓ Apply
            </button>
            <button
              onClick={onRetry}
              className="generation-bar-btn generation-bar-btn-secondary"
              title="重新生成"
            >
              ↻ Retry
            </button>
            <button
              onClick={onDiscard}
              className="generation-bar-btn generation-bar-btn-secondary"
              title="丢弃生成内容"
            >
              ✕ Discard
            </button>
            {onSection && (
              <button
                onClick={onSection}
                className="generation-bar-btn generation-bar-btn-secondary"
                title="拆分为段落块"
              >
                § Section
              </button>
            )}
          </div>
          <div className="generation-bar-info">
            <span>{wordCount} 字</span>
            <span className="generation-bar-sep">|</span>
            <span>{model}</span>
          </div>
        </div>
      )}
    </div>
  );
}
