/**
 * Playhead — DAW-style draggable vertical cursor spanning all tracks.
 *
 * Single playhead position (chapter number), draggable via handle.
 * Renders as a gold vertical line with a triangular handle.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface PlayheadProps {
  /** Current playhead chapter position */
  chapter: number;
  /** View range [start, end] for percentage calculation */
  viewStart: number;
  viewEnd: number;
  totalChapters: number;
  /** Container ref for mouse position calculation */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called when playhead is dragged to a new chapter */
  onChange: (chapter: number) => void;
  /** Optional: height offset from top (for compact mode) */
  top?: number;
  /** Optional: height of the line (for full mode, default: full container) */
  height?: number;
}

export function Playhead({
  chapter, viewStart, viewEnd, totalChapters,
  containerRef, onChange, top = 0, height,
}: PlayheadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ viewStart: 0, viewEnd: 0, totalChapters: 0 });

  const range = viewEnd - viewStart;
  const pct = range > 0 ? ((chapter - viewStart) / range) * 100 : 0;

  // All hooks must be declared before any early return (React rules)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { viewStart, viewEnd, totalChapters };
    setIsDragging(true);
  }, [viewStart, viewEnd, totalChapters]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const raw = dragRef.current.viewStart + pct * (dragRef.current.viewEnd - dragRef.current.viewStart);
      const snapped = Math.max(1, Math.min(dragRef.current.totalChapters, Math.round(raw)));
      onChange(snapped);
    };
    const onMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, containerRef, onChange]);

  // Don't render if outside visible range (after all hooks)
  if (pct < -2 || pct > 102) return null;

  return (
    <div
      className={`playhead${isDragging ? " is-dragging" : ""}`}
      style={{
        left: `${pct}%`,
        top,
        height: height ?? "100%",
      }}
    >
      {/* Handle (top) */}
      <div className="playhead-handle" onMouseDown={handleMouseDown}>
        <svg viewBox="0 0 12 10" width="12" height="10">
          <polygon points="0,0 12,0 6,10" fill="currentColor" />
        </svg>
      </div>

      {/* Line */}
      <div className="playhead-line" />

      {/* Chapter label (visible when dragging) */}
      {isDragging && (
        <div className="playhead-label">ch {chapter}</div>
      )}
    </div>
  );
}
