import { LayoutGrid } from "lucide-react";

export function PlanMatrixView() {
  return (
    <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
      <div className="text-center">
        <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">矩阵视图即将推出</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">Scene × Codex 交叉引用表</p>
      </div>
    </div>
  );
}
