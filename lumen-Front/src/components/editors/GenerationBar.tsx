/**
 * GenerationBar — 统一 AI 生成状态条
 *
 * 分段按钮组风格：一体化容器 + divide-x 分隔线
 * 布局：[Stop/Apply] | [Retry] | [Discard] | [Section]  ·  字数, 模型
 */

import { TypingDots } from "./TypingDots";
import {
  Check,
  RotateCw,
  Trash2,
} from "lucide-react";
import { SectionBlockIcon } from "../icons";

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
  const generating = status === "generating";

  return (
    <div className="generation-bar" contentEditable={false}>
      {/* 按钮组：分段式 */}
      <div className="generation-bar-group">
        {generating ? (
          <button
            onClick={onStop}
            className="generation-bar-btn generation-bar-btn-stop"
            title="停止生成"
          >
            <span className="generation-bar-spin" />
            Stop
          </button>
        ) : (
          <button
            onClick={onApply}
            className="generation-bar-btn"
            title="接受生成内容"
          >
            <Check size={13} />
            Apply
          </button>
        )}

        <button
          onClick={onRetry}
          className="generation-bar-btn"
          title="重新生成"
        >
          <RotateCw size={13} />
          Retry
        </button>
        <button
          onClick={onDiscard}
          className="generation-bar-btn"
          title="丢弃生成内容"
        >
          <Trash2 size={13} />
          Discard
        </button>
        {onSection && (
          <button
            onClick={onSection}
            className="generation-bar-btn"
            title="拆分为段落块"
          >
            <SectionBlockIcon size={13} />
            Section
          </button>
        )}
      </div>

      {/* 信息区 */}
      <div className="generation-bar-info">
        {generating ? <TypingDots size={4} /> : <span>{wordCount} 字</span>}
        <span className="generation-bar-info-sep">·</span>
        <span>{model}</span>
      </div>
    </div>
  );
}
