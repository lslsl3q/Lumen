/**
 * 自定义图标 — lucide 没有的图标放在这里
 *
 * 用法跟 lucide-react 一样：
 *   import { SectionBlockIcon } from "../icons";
 *   <SectionBlockIcon size={14} />
 */

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Section Block 图标 — 虚线方框，8 段（4 直角 L 形 + 4 中间线）
 *
 * 仿 Font Awesome fa-square-dashed 风格。
 * 方框 (3,3)-(21,21)，每段端头圆角（strokeLinecap round）。
 */
export function SectionBlockIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      {/* 4 corner L-shapes */}
      <path d="M5,3 L3,3 L3,5" />
      <path d="M19,3 L21,3 L21,5" />
      <path d="M21,19 L21,21 L19,21" />
      <path d="M5,21 L3,21 L3,19" />
      {/* 4 middle lines */}
      <path d="M8,3 L16,3" />
      <path d="M21,8 L21,16" />
      <path d="M16,21 L8,21" />
      <path d="M3,16 L3,8" />
    </svg>
  );
}
