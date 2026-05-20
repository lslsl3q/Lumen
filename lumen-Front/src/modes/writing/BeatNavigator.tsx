import { useRef, useEffect, useCallback } from "react";

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
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const clickOffsetY = useRef(0);
  const dragState = useRef({ containerTop: 0, trackH: 0, maxScroll: 0 });

  const updateIndicator = useCallback(() => {
    if (dragging.current) return;
    const el = scrollContainerRef.current;
    const ind = indicatorRef.current;
    if (!el || !ind) return;
    const cl = el.clientHeight;
    const sh = el.scrollHeight;
    const maxScroll = sh - cl;
    if (maxScroll <= 0) return;
    const indH = (cl / sh) * cl;
    const indTop = (el.scrollTop / maxScroll) * (cl - indH);
    ind.style.top = `${indTop}px`;
    ind.style.height = `${indH}px`;
  }, [scrollContainerRef]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateIndicator, { passive: true });
    requestAnimationFrame(updateIndicator);
    return () => el.removeEventListener("scroll", updateIndicator);
  }, [scrollContainerRef, updateIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollContainerRef.current;
    const ind = indicatorRef.current;
    if (!el || !ind) return;
    const cl = el.clientHeight;
    const sh = el.scrollHeight;
    const maxScroll = sh - cl;
    if (maxScroll <= 0) return;

    const indH = (cl / sh) * cl;
    const effectiveTrackH = cl - indH;
    const containerTop = el.getBoundingClientRect().top;

    dragState.current = { containerTop, trackH: effectiveTrackH, maxScroll };

    const currentIndTop = (el.scrollTop / maxScroll) * effectiveTrackH;
    const relY = e.clientY - containerTop - currentIndTop;
    clickOffsetY.current = (relY >= 0 && relY <= indH) ? relY : indH / 2;

    dragging.current = true;
    e.preventDefault();

    const newIndTop = e.clientY - containerTop - clickOffsetY.current;
    const clamped = Math.max(0, Math.min(newIndTop, effectiveTrackH));
    el.scrollTo({ top: (clamped / effectiveTrackH) * maxScroll, behavior: "instant" });
    ind.style.top = `${clamped}px`;
    ind.style.height = `${indH}px`;
  }, [scrollContainerRef]);

  useEffect(() => {
    let rafId = 0;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        const ind = indicatorRef.current;
        if (!el || !ind) return;
        const { containerTop, trackH, maxScroll } = dragState.current;
        if (trackH <= 0) return;

        const newIndTop = e.clientY - containerTop - clickOffsetY.current;
        const clamped = Math.max(0, Math.min(newIndTop, trackH));
        el.scrollTo({ top: (clamped / trackH) * maxScroll, behavior: "instant" });
        ind.style.top = `${clamped}px`;
      });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      requestAnimationFrame(updateIndicator);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scrollContainerRef, updateIndicator]);

  const cl = scrollContainerRef.current?.clientHeight || 600;
  const scale = totalHeight > 0 && cl > 0 ? cl / totalHeight : 1;

  return (
    <div
      className="sticky top-0 float-right w-6 cursor-ns-resize select-none overflow-visible"
      style={{ height: 0, zIndex: 20 }}
      onMouseDown={handleMouseDown}
    >
      <div
        ref={innerRef}
        className="w-6 h-screen"
        style={{ background: "rgb(24, 24, 27)" }}
      >
        {beats.map((beat) => {
          const top = beat.offsetTop * scale;
          const h = Math.max(2, beat.height * scale);
          return (
            <div
              key={beat.id}
              className="absolute rounded-sm"
              style={{
                left: 2,
                right: 4,
                top: `${top}px`,
                height: `${h}px`,
                backgroundColor: beat.color,
                opacity: 0.85,
              }}
              title={beat.label}
            />
          );
        })}

        <div
          ref={indicatorRef}
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: 0,
            height: 0,
            background: "rgba(255,255,255,0.18)",
            borderRadius: "4px",
          }}
        />
      </div>
    </div>
  );
}
