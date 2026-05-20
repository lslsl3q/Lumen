import type { ReactNode } from "react";
import { Search } from "lucide-react";

export function SidebarToolbar({
  search,
  onSearchChange,
  placeholder,
  children,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex-none flex items-center gap-1.5 px-2 py-2 border-b border-[var(--color-border)]">
      <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white/5 border border-[var(--color-border)]">
        <Search className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-none" />
        <input
          className="flex-1 bg-transparent text-[12px] text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-dim)]"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {children}
    </div>
  );
}
