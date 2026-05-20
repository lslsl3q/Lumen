interface InsertButtonProps {
  label: string;
  onClick: () => void;
  variant?: "scene" | "chapter" | "act";
}

export function InsertButton({ label, onClick, variant }: InsertButtonProps) {
  const btn = (
    <button
      className="insert-btn"
      onClick={onClick}
      type="button"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {label}
    </button>
  );

  if (variant === "chapter") {
    return (
      <div className="insert-btn-chapter">
        <div className="manuscript-inner">{btn}</div>
      </div>
    );
  }

  if (variant === "act") {
    return (
      <div className="insert-btn-act">
        <div className="manuscript-inner">{btn}</div>
      </div>
    );
  }

  return (
    <div className="manuscript-inner" style={{ marginTop: "var(--scene-gap)" }}>{btn}</div>
  );
}
