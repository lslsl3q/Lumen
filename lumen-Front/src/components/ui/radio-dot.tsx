import { cn } from "@/lib/utils"

/**
 * 纯视觉 Radio 圆点指示器。
 * 粗边框环风格：选中时边框加粗变亮 + 微缩，hover 时放大 + 微光晕。
 *
 * 两种用法：
 * 1. <RadioDot selected={true} /> — 直接传 prop（自动加 data-checked）
 * 2. 放在 RadioGroupItem 内部 — 父元素 data-checked 驱动样式
 */
export function RadioDot({
  selected,
  className,
}: {
  selected?: boolean
  className?: string
}) {
  return (
    <span
      data-slot="radio-dot"
      data-checked={selected || undefined}
      className={cn(
        "radio-dot relative flex aspect-square size-4 shrink-0 rounded-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
        /* 未选中 */
        "border-2 border-[var(--color-border)]",
        /* hover — 需要 group/radio-dot 父级配合 */
        "group-hover/radio-dot:scale-105 group-hover/radio-dot:border-[var(--color-primary-dim)] group-hover/radio-dot:shadow-[0_0_8px_var(--glow-subtle)]",
        /* 选中 — 自身 data-checked（prop 驱动） */
        "data-checked:scale-90 data-checked:border-[4px] data-checked:border-[var(--color-primary)] data-checked:shadow-none",
        className,
      )}
    />
  )
}
