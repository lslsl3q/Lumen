import { useRef, useEffect, useState, useCallback } from "react";

export interface BeatInfo {
  id: string;
  color: string;
  label: string;
  offsetTop: number;
  height: number;
}

interface BeatNavigatorProps {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  beats: BeatInfo[];
  totalHeight: number;
}

export function BeatNavigator({
  scrollContainerRef,
  beats,
  totalHeight,
}: BeatNavigatorProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const [viewportTop, setViewportTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const updateViewport = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setViewportTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
  }, [scrollContainerRef]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateViewport);
    updateViewport();
    return () => el.removeEventListener("scroll", updateViewport);
  }, [scrollContainerRef, updateViewport]);

  useEffect(() => {
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [updateViewport]);

  const navHeight = navRef.current?.clientHeight || 600;
  const scale = totalHeight > 0 ? navHeight / totalHeight : 1;

  const viewportStart = viewportTop * scale;
  const viewportSize = viewportHeight * scale;

  return (
    <div
      ref={navRef}
      className="relative w-3 flex-none bg-gray-900 cursor-pointer"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = y / rect.height;
        const el = scrollContainerRef.current;
        if (el) {
          el.scrollTop = ratio * totalHeight - el.clientHeight / 2;
        }
      }}
    >
      {/* Beat markers */}
      {beats.map((beat) => (
        <div
          key={beat.id}
          className="absolute left-0.5 right-0.5 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          style={{
            top: `${beat.offsetTop * scale}px`,
            height: `${Math.max(2, beat.height * scale)}px`,
            backgroundColor: beat.color,
          }}
          title={beat.label}
        />
      ))}

      {/* Current viewport indicator */}
      <div
        className="absolute left-0 right-0 bg-white/10 pointer-events-none rounded-sm"
        style={{
          top: `${viewportStart}px`,
          height: `${viewportSize}px`,
        }}
      />
    </div>
  );
}
