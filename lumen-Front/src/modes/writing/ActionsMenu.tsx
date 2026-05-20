import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../../components/ui/dropdown-menu";

interface ActionsMenuProps {
  className?: string;
  iconSize?: string;
  children: React.ReactNode;
}

export function ActionsMenu({ className, iconSize = "w-3.5 h-3.5", children }: ActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={className || "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors cursor-pointer"}
      >
        <MoreVertical className={iconSize} />
        Actions
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
