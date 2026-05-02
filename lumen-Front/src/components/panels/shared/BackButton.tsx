/**
 * BackButton — 面板返回导航按钮（共享组件）
 */
import { Button } from '@/components/ui/button';

interface BackButtonProps {
  label: string;
  onClick: () => void;
}

export function BackButton({ label, onClick }: BackButtonProps) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      className="w-full justify-start text-slate-500 hover:text-slate-300"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </Button>
  );
}
