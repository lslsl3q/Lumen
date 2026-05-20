import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export function ToggleSwitch({ checked, onChange, className }: ToggleSwitchProps) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={onChange ? 0 : -1}
      className={cn("toggle-switch", onChange && "cursor-pointer", className)}
      data-state={checked ? "on" : "off"}
      onClick={onChange ? () => { onChange(!checked); } : undefined}
      onKeyDown={onChange ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } } : undefined}
    />
  );
}
