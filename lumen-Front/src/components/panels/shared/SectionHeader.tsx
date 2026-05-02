/**
 * SectionHeader — 面板分组标题（共享）
 */
import { Separator } from '@/components/ui/separator';

interface SectionHeaderProps {
  children: React.ReactNode;
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <div className="px-3 pt-3">
      <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">
        {children}
      </span>
    </div>
  );
}

/** 面板分隔线 */
export function PanelDivider() {
  return <Separator className="mx-3 my-1 bg-slate-800/40" />;
}
