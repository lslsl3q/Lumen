import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function ToggleSwitch({ checked, onChange, className }: ToggleSwitchProps) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      className={cn("toggle-switch cursor-pointer", className)}
      data-state={checked ? "on" : "off"}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
    />
  );
}
