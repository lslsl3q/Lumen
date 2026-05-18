interface InsertButtonProps {
  label: string;
  onClick: () => void;
}

export function InsertButton({ label, onClick }: InsertButtonProps) {
  return (
    <div className="my-2">
      <button
        className="w-full py-1.5 rounded text-[12px] text-text-muted hover:text-text-secondary hover:bg-white/5 border border-dashed border-border-default transition-colors cursor-pointer"
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}
