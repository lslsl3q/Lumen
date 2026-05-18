/**
 * BeatNavigator — 24px sticky 导航面板
 *
 * 深色背景 + 彩色 beat 标记 + viewport 指示器 + 点击跳转。
 * sticky top-0 粘在滚动容器右边缘，不随内容滚动。
 */
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
      className="w-6 flex-none shrink-0 sticky top-0 h-full cursor-pointer select-none overflow-visible"
      style={{ background: "rgb(24, 24, 27)" }}
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
      {/* Beat markers — 彩色色块贴左 */}
      {beats.map((beat) => {
        const top = beat.offsetTop * scale;
        const height = Math.max(2, beat.height * scale);
        const inViewport = top + height >= viewportStart && top <= viewportStart + viewportSize;
        return (
          <div
            key={beat.id}
            className="absolute rounded-sm transition-opacity"
            style={{
              left: 2,
              right: 4,
              top: `${top}px`,
              height: `${height}px`,
              backgroundColor: beat.color,
              opacity: inViewport ? 0.85 : 0.35,
            }}
            title={beat.label}
          />
        );
      })}

      {/* Viewport 指示条 — 显示当前可见区域 */}
      <div
        className="absolute left-0 right-0 pointer-events-none rounded-sm"
        style={{
          top: `${viewportStart}px`,
          height: `${viewportSize}px`,
          background: "rgba(255,255,255,0.06)",
          borderLeft: "2px solid rgba(255,255,255,0.15)",
        }}
      />
    </div>
  );
}
