import { useState, type ReactNode } from "react";

/** Label color palette — shared between ProjectSettings and Prompt Manager */
export const LABEL_COLORS: { key: string; hex: string }[] = [
  { key: "Black", hex: "#1f2937" },
  { key: "Gray", hex: "#6b7280" },
  { key: "Brown", hex: "#92400e" },
  { key: "Orange", hex: "#ea580c" },
  { key: "Yellow", hex: "#ca8a04" },
  { key: "Green", hex: "#16a34a" },
  { key: "Blue", hex: "#2563eb" },
  { key: "Purple", hex: "#7c3aed" },
  { key: "Pink", hex: "#db2777" },
  { key: "Red", hex: "#dc2626" },
];

export interface LabelRowProps {
  /** Current label name */
  name: string;
  /** Current color key or hex */
  color: string;
  /** Called when name changes */
  onNameChange: (name: string) => void;
  /** Called when color changes — omit to hide color picker */
  onColorChange?: (color: string) => void;
  /** Called when delete is requested */
  onDelete?: () => void;
  /** Disable editing */
  disabled?: boolean;
  /** Optional slot for drag handle, star toggle, etc. */
  leading?: ReactNode;
  /** Optional slot between name input and Clear button (e.g. Advanced button) */
  afterInput?: ReactNode;
}

/**
 * Shared label editor row — NC-style proportions.
 * Row: [leading] [color dot] [name input] [Clear] [× delete]
 * Click color dot to toggle color swatches below.
 */
export function LabelRow({
  name,
  color,
  onNameChange,
  onColorChange,
  onDelete,
  disabled = false,
  leading,
  afterInput,
}: LabelRowProps) {
  const [showColors, setShowColors] = useState(false);
  const resolvedColor = LABEL_COLORS.find((c) => c.key === color)?.hex || color || "#6b7280";

  return (
    <div>
      {/* Main row — NC proportions: 36px height, 14px font */}
      <div className="flex items-center gap-1">
        {leading}
        <button
          type="button"
          onClick={() => !disabled && onColorChange && setShowColors(!showColors)}
          className="shrink-0 cursor-pointer p-0 border-none bg-transparent flex items-center justify-center"
          style={{ width: 36, height: 36 }}
          title={onColorChange ? "Change color" : undefined}
        >
          <span
            className={`block rounded ${onColorChange && !disabled ? "hover:ring-2 hover:ring-white/30 transition-all" : ""}`}
            style={{ width: 16, height: 16, background: resolvedColor }}
          />
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          readOnly={disabled}
          className="flex-1 min-w-0 border rounded outline-none focus:border-zinc-500"
          style={{
            height: 36,
            fontSize: 14,
            padding: "6px 10px",
            lineHeight: "20px",
            borderColor: "rgb(82, 82, 91)",
            borderRadius: 4,
            background: disabled ? "transparent" : "rgba(63, 63, 70, 0.25)",
            color: "#e4e4e7",
          }}
        />
        {afterInput}
        {!disabled && (
          <>
            {onColorChange && (
              <button
                type="button"
                onClick={() => onColorChange("Gray")}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer shrink-0"
                style={{ height: 36, padding: "6px 10px", fontSize: 12, borderRadius: 4 }}
              >
                Clear
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-zinc-500 hover:text-red-400 cursor-pointer shrink-0 flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 4, fontSize: 16 }}
              >
                ×
              </button>
            )}
          </>
        )}
      </div>

      {/* Color swatches — toggle via color dot */}
      {showColors && !disabled && onColorChange && (
        <div className="flex items-center gap-1" style={{ paddingLeft: 36 + 4 }}>
          {LABEL_COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => { onColorChange(c.key); setShowColors(false); }}
              className={`rounded-sm transition-transform cursor-pointer border-none p-0 ${
                color === c.key ? "ring-2 ring-white/40 scale-110" : ""
              }`}
              style={{ width: 20, height: 20, background: c.hex }}
              title={c.key}
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  );
}
