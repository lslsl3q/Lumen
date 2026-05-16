// lumen-Front/src/modes/writing/ViewTabs.tsx
import { cn } from "../../lib/utils";

export type WritingView = "plan" | "write" | "chat" | "review";

interface ViewTabsProps {
  activeView: WritingView;
  onViewChange?: (view: WritingView) => void;
}

const views: { id: WritingView; label: string; disabled: boolean }[] = [
  { id: "plan", label: "Plan", disabled: true },
  { id: "write", label: "Write", disabled: false },
  { id: "chat", label: "Chat", disabled: true },
  { id: "review", label: "Review", disabled: true },
];

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {views.map((v) => (
        <button
          key={v.id}
          onClick={() => !v.disabled && onViewChange?.(v.id)}
          disabled={v.disabled}
          className={cn(
            "text-xs font-semibold rounded px-2.5 py-1.5 transition-colors",
            "focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2",
            activeView === v.id
              ? "bg-gray-800 text-stone-300"
              : "bg-transparent text-stone-400 hover:text-stone-300",
            v.disabled && "opacity-40 pointer-events-none"
          )}
          aria-label={`Open ${v.label} View`}
          type="button"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
