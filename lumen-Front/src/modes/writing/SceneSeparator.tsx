export function SceneSeparator() {
  return (
    <div className="scene-separator">
      <div className="manuscript-inner flex flex-col lg:flex-row lg:gap-[var(--gap)]">
        <div className="manuscript-content flex items-center justify-center" style={{ color: "var(--color-text-primary)" }}>
          <svg
            viewBox="0 0 400 40"
            fill="none"
            className="h-5 w-1/2 max-w-xs"
            aria-hidden="true"
          >
            <circle cx="37" cy="20" r="3" fill="currentColor" opacity="0.8" />
            <line x1="40" y1="20" x2="137" y2="20" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
            <path d="M137 20 L148 11 L159 20 L148 29 Z" fill="currentColor" opacity="0.8" />
            <line x1="159" y1="20" x2="180" y2="20" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
            <path d="M180 20 L200 3 L220 20 L200 37 Z" stroke="currentColor" strokeWidth="1.8" opacity="0.6" fill="none" />
            <path d="M191 20 L200 11 L209 20 L200 29 Z" fill="currentColor" opacity="0.45" />
            <circle cx="200" cy="20" r="2.2" fill="currentColor" opacity="0.65" />
            <line x1="220" y1="20" x2="241" y2="20" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
            <path d="M241 20 L252 11 L263 20 L252 29 Z" fill="currentColor" opacity="0.8" />
            <line x1="263" y1="20" x2="360" y2="20" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
            <circle cx="363" cy="20" r="3" fill="currentColor" opacity="0.8" />
          </svg>
        </div>
        <div className="manuscript-side" />
      </div>
    </div>
  );
}
