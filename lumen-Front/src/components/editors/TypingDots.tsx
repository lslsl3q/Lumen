/**
 * TypingDots — 三点弹跳动画（无阴影版）
 * 用于 GenerationBar 生成中的字数占位
 */
export function TypingDots({ size = 6, className }: { size?: number; className?: string }) {
  return (
    <span className={`typing-dots ${className ?? ""}`}>
      <span className="typing-dots-dot" style={{ animationDelay: "0s" }} />
      <span className="typing-dots-dot" style={{ animationDelay: "0.15s" }} />
      <span className="typing-dots-dot" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}
