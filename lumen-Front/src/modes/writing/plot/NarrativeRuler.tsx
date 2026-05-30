/**
 * NarrativeRuler — 剪辑式叙事标尺（带 Range-Based 缩放）
 *
 * 隐喻：编曲窗口时间线（Node=clip段，KeyPoint=标记，Phase=参考层）
 * 读者视角 = 单轨（主/支首尾相接），暗线 = 独立多轨
 * 缩放 = 改变可见章节范围 [viewStart, viewEnd]，不靠 CSS scale
 */

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { PlotArc, PlotNode, PlotLink, ManuscriptAct } from "../../../api/writing";
import { Playhead } from "./Playhead";

// ── Types ──

interface FlattenedNode {
  node: PlotNode;
  lineType: "main" | "subplot" | "dark";
  lineTitle: string;
  lineId: string;
  arcTitle: string;
  startCh: number;
  endCh: number;
  /** Visual left % within current view range (computed in viewMemo) */
  leftPct: number;
  /** Visual width % within current view range */
  widthPct: number;
  status: "resolved" | "current" | "future";
}

interface DarkTrackData {
  lineId: string;
  lineTitle: string;
  nodes: FlattenedNode[];
}

interface TickMark {
  ch: number;
  leftPct: number;
}

// ── Constants ──

const PHASES = [
  { label: "Setup", role: "orphan", range: [0, 0.25] as const },
  { label: "Response", role: "wanderer", range: [0.25, 0.5] as const },
  { label: "Attack", role: "warrior", range: [0.5, 0.75] as const },
  { label: "Resolution", role: "martyr", range: [0.75, 1.0] as const },
];

const TYPE_LABELS: Record<string, string> = {
  main: "主线",
  subplot: "支线",
  dark: "暗线",
};

function calculateTickSpacing(range: number): number {
  if (range <= 15) return 1;
  if (range <= 50) return 5;
  if (range <= 150) return 10;
  return 25;
}

/** Derive chapter range from an Arc's main/subplot nodes (dark lines excluded) */
export function arcChapterRange(arc: PlotArc): { start: number; end: number } {
  const chapters = (arc.lines || [])
    .filter(l => l.type !== "dark")
    .flatMap(l =>
      (l.nodes || []).flatMap(n => [n.start_ch, n.end_ch].filter(Boolean) as number[])
    );
  if (chapters.length === 0) return { start: 0, end: 0 };
  return { start: Math.min(...chapters), end: Math.max(...chapters) };
}

// ── Sub-components ──

function SegClip({ fn, minSegW, onDoubleClick, onContextMenu }: { fn: FlattenedNode; minSegW: number; onDoubleClick?: (id: string) => void; onContextMenu?: (id: string, e: React.MouseEvent) => void }) {
  const typeClass = fn.lineType === "main" ? "nr-seg-main" : "nr-seg-sub";
  return (
    <div
      className={`nr-seg ${typeClass} ${fn.status}`}
      style={{ left: `${fn.leftPct}%`, width: `${Math.max(fn.widthPct, minSegW)}%` }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(fn.node.id); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(fn.node.id, e); }}
    >
      <span className="nr-seg-label">{fn.node.title || ""}</span>
      <div className="nr-tt">
        <span className={`nr-ts nr-ts-${fn.lineType}`}>{TYPE_LABELS[fn.lineType] || TYPE_LABELS.main}</span>
        <span className="nr-tt-title">{fn.node.title || "未命名"}</span>
        <br />
        <span className="nr-tt-meta">ch {fn.startCh ?? "?"}~{fn.endCh ?? "?"} · {fn.arcTitle}</span>
        {fn.status === "current" && <><br /><span className="nr-tt-cur">← ch 当前</span></>}
      </div>
    </div>
  );
}

function DarkSegClip({ fn, minSegW, onDoubleClick, onContextMenu }: { fn: FlattenedNode; minSegW: number; onDoubleClick?: (id: string) => void; onContextMenu?: (id: string, e: React.MouseEvent) => void }) {
  return (
    <div
      className={`nr-dseg nr-seg-dark ${fn.status}`}
      style={{ left: `${fn.leftPct}%`, width: `${Math.max(fn.widthPct, minSegW)}%` }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(fn.node.id); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(fn.node.id, e); }}
    >
      <span className="nr-dseg-label">{fn.node.title || ""}</span>
      <div className="nr-tt">
        <span className="nr-ts nr-ts-dark">{TYPE_LABELS.dark}</span>
        <span className="nr-tt-title">{fn.node.title || "未命名"}</span>
        <br />
        <span className="nr-tt-meta">ch {fn.startCh ?? "?"}~{fn.endCh ?? "?"} · {fn.arcTitle}</span>
        {fn.status === "current" && <><br /><span className="nr-tt-cur">← 当前暗线活动</span></>}
      </div>
    </div>
  );
}

function CursorLine({ chapter, labelBelow = false }: { chapter: number; labelBelow?: boolean }) {
  return (
    <div className="nr-cursor-line">
      <div className="nr-cursor-bar" />
      {labelBelow ? (
        <>
          <span className="nr-cursor-tri nr-cursor-top">▾</span>
          <div className="nr-cursor-bottom">
            <span className="nr-cursor-tri">▴</span>
            <span className="nr-cursor-label">ch {Math.round(chapter)}</span>
          </div>
        </>
      ) : (
        <>
          <div className="nr-cursor-top">
            <span className="nr-cursor-label">ch {Math.round(chapter)}</span>
            <span className="nr-cursor-tri">▾</span>
          </div>
          <span className="nr-cursor-tri nr-cursor-bottom">▴</span>
        </>
      )}
    </div>
  );
}

function PlotLinkArrow({ leftPct }: { leftPct: number }) {
  return (
    <div className="nr-plink" style={{ left: `${leftPct}%` }}>
      <div className="nr-plink-line" />
      <div className="nr-plink-arrow">↓</div>
    </div>
  );
}

// ── Main ──

export interface NarrativeRulerProps {
  arcs?: PlotArc[];
  currentChapter?: number;
  totalChapters?: number;
  onDrillArc?: (arcId: string) => void;
  compact?: boolean;
  showDarkLines?: boolean;
  links?: PlotLink[];
  plotTitle?: string;
  /** Controlled view range [start, end]. undefined = fit-all */
  viewRange?: [number, number];
  onViewRangeChange?: (range: [number, number]) => void;
  /** Manuscript acts for mapping chapter ranges to volume labels */
  acts?: ManuscriptAct[];
  /** Fired when user double-clicks a node segment (opens workbench) */
  onDoubleClickNode?: (nodeId: string) => void;
  /** Fired when user right-clicks a node segment (opens context menu) */
  onContextMenuNode?: (nodeId: string, e: React.MouseEvent) => void;
  /** Unified playhead chapter position */
  playhead?: number;
  /** Fired when playhead is dragged */
  onPlayheadChange?: (chapter: number) => void;
  /** If provided, renders arbitrary content in the zoom bar (e.g. AddNodeMenu) */
  addNodeSlot?: React.ReactNode;
}

export function NarrativeRuler({
  arcs = [],
  currentChapter = 1,
  totalChapters = 20,
  onDrillArc,
  compact = false,
  showDarkLines = true,
  links = [],
  plotTitle,
  viewRange: controlledRange,
  onViewRangeChange,
  acts = [],
  onDoubleClickNode,
  onContextMenuNode,
  playhead,
  onPlayheadChange,
  addNodeSlot,
}: NarrativeRulerProps) {
  // ── Simplified controlled / uncontrolled state ──
  const [internalRange, setInternalRange] = useState<[number, number]>(() => [1, totalChapters]);
  const viewStart = controlledRange ? controlledRange[0] : internalRange[0];
  const viewEnd = controlledRange ? controlledRange[1] : internalRange[1];
  const range = viewEnd - viewStart;
  const zoom = totalChapters / range;

  const setViewRange = useCallback((s: number, e: number) => {
    const clamped: [number, number] = [Math.max(1, s), Math.min(totalChapters, e)];
    if (onViewRangeChange) {
      onViewRangeChange(clamped);
    } else {
      setInternalRange(clamped);
    }
  }, [onViewRangeChange, totalChapters]);

  // Reset to fit-all when data changes (uncontrolled mode only)
  useEffect(() => {
    if (!controlledRange) {
      setInternalRange([1, totalChapters]);
    }
  }, [totalChapters, controlledRange]);

  // ── Mutable ref for native event handlers ──
  const stateRef = useRef({ viewStart, viewEnd, totalChapters });
  stateRef.current = { viewStart, viewEnd, totalChapters };

  // ── Memo 1: Raw data (chapter-based, zoom-independent) ──
  const rawData = useMemo(() => {
    const mainSub: FlattenedNode[] = [];
    const darkMap = new Map<string, { title: string; nodes: FlattenedNode[] }>();

    for (const arc of arcs) {
      const arcTitle = arc.title || "Arc";
      for (const line of arc.lines || []) {
        const lt = (line.type as FlattenedNode["lineType"]) || "main";
        const lineTitle = line.title || line.name || "";
        const nodes = line.nodes || [];

        for (const node of nodes) {
          const startCh = node.start_ch || node.sort_order || 1;
          const endCh = node.end_ch || startCh + 1;
          let status: FlattenedNode["status"] = "future";
          if (node.resolved) status = "resolved";
          else if (currentChapter >= startCh && currentChapter <= endCh) status = "current";

          const fn: FlattenedNode = {
            node, lineType: lt, lineTitle, lineId: line.id, arcTitle,
            startCh, endCh, leftPct: 0, widthPct: 0, status,
          };

          if (lt === "dark") {
            const groupKey = line.name || line.id;
            if (!darkMap.has(groupKey)) {
              darkMap.set(groupKey, { title: line.name || lineTitle || "暗线", nodes: [] });
            }
            darkMap.get(groupKey)!.nodes.push(fn);
          } else {
            mainSub.push(fn);
          }
        }
      }
    }

    mainSub.sort((a, b) => a.startCh - b.startCh);
    for (let i = 1; i < mainSub.length; i++) {
      const prevEnd = mainSub[i - 1].endCh;
      if (mainSub[i].startCh < prevEnd) {
        mainSub[i].startCh = prevEnd;
        mainSub[i].endCh = Math.max(mainSub[i].endCh, prevEnd + 1);
      }
    }

    const darkTracks: DarkTrackData[] = Array.from(darkMap.entries()).map(([lineId, data]) => ({
      lineId, lineTitle: data.title, nodes: data.nodes,
    }));

    return { mainSub, darkTracks };
  }, [arcs, currentChapter]);

  // ── Memo 2: View-dependent data (filter + toPct) ──
  const toPct = useCallback((ch: number) => ((ch - viewStart) / range) * 100, [viewStart, range]);

  const { mainSubVisible, darkTracksVisible, linkPositionsVisible, ticks } = useMemo(() => {
    const convert = (fn: FlattenedNode): FlattenedNode => ({
      ...fn,
      leftPct: toPct(fn.startCh),
      widthPct: toPct(fn.endCh) - toPct(fn.startCh),
    });

    const mainSubVis = rawData.mainSub
      .filter(fn => fn.endCh >= viewStart && fn.startCh <= viewEnd)
      .map(convert);

    const darkVis: DarkTrackData[] = rawData.darkTracks.map(track => ({
      ...track,
      nodes: track.nodes
        .filter(fn => fn.endCh >= viewStart && fn.startCh <= viewEnd)
        .map(convert),
    })).filter(t => t.nodes.length > 0);

    const allVisNodes = [...mainSubVis, ...darkVis.flatMap(t => t.nodes)];
    const nodeMap = new Map(allVisNodes.map(fn => [fn.node.id, fn.leftPct]));
    // Collect link positions from both source and target ends
    const lp = links
      .flatMap(link => [
        nodeMap.get(link.source_node_id) ?? null,
        nodeMap.get(link.target_node_id) ?? null,
      ])
      .filter((p): p is number => p != null);

    const spacing = calculateTickSpacing(range);
    const firstTick = Math.ceil(viewStart / spacing) * spacing;
    const tickList: TickMark[] = [];
    for (let ch = firstTick; ch <= viewEnd; ch += spacing) {
      tickList.push({ ch, leftPct: toPct(ch) });
    }

    return {
      mainSubVisible: mainSubVis,
      darkTracksVisible: darkVis,
      linkPositionsVisible: lp,
      ticks: tickList,
    };
  }, [rawData, viewStart, viewEnd, range, toPct, links]);

  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);
  const dragAnchor = useRef({ mouseX: 0, viewStart: 0, viewEnd: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  // ── Wheel handler (native event, passive:false for preventDefault) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { viewStart: vs, viewEnd: ve, totalChapters: tc } = stateRef.current;
      const rect = container.getBoundingClientRect();
      const currentRange = ve - vs;
      const isLineMode = e.deltaMode === 1;

      // Trackpad horizontal swipe → horizontal pan
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const chDelta = (e.deltaX / rect.width) * currentRange;
        const ns = Math.max(1, vs + chDelta);
        const ne = ns + currentRange;
        if (ne <= tc) setViewRange(ns, ne);
        return;
      }

      // Trackpad small vertical swipe (pixel mode, no ctrlKey) → horizontal pan
      if (!isLineMode && !e.ctrlKey && Math.abs(e.deltaY) < 50) {
        const chDelta = (e.deltaY / rect.width) * currentRange * 0.5;
        const ns = Math.max(1, vs + chDelta);
        const ne = ns + currentRange;
        if (ne <= tc) setViewRange(ns, ne);
        return;
      }

      // Physical mouse wheel / pinch → zoom centered on mouse
      const mousePct = (e.clientX - rect.left) / rect.width;
      const mouseCh = vs + mousePct * currentRange;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const newRange = Math.max(currentRange / factor, 5);
      const clampedRange = Math.min(newRange, tc);

      let ns = mouseCh - mousePct * clampedRange;
      let ne = ns + clampedRange;
      if (ns < 1) { ns = 1; ne = 1 + clampedRange; }
      if (ne > tc) { ne = tc; ns = tc - clampedRange; }

      setViewRange(ns, ne);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [setViewRange]);

  // ── Drag pan (absolute anchor, reads totalChapters from stateRef) ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.nr-seg, .nr-dseg, .nr-zoom-bar, button')) return;
    if (e.button !== 0) return;
    dragAnchor.current = { mouseX: e.clientX, viewStart, viewEnd };
    setIsDragging(true);
  }, [viewStart, viewEnd]);

  useEffect(() => {
    if (!isDragging) return;
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const anchorRange = dragAnchor.current.viewEnd - dragAnchor.current.viewStart;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragAnchor.current.mouseX;
      const chDelta = (deltaX / containerWidth) * anchorRange;
      const tc = stateRef.current.totalChapters;
      let newStart = dragAnchor.current.viewStart - chDelta;
      let newEnd = newStart + anchorRange;
      if (newStart < 1) { newStart = 1; newEnd = 1 + anchorRange; }
      if (newEnd > tc) { newEnd = tc; newStart = tc - anchorRange; }
      setViewRange(newStart, newEnd);
    };
    const onMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, setViewRange]);

  // ── Spacebar → hand tool ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target as HTMLElement).closest('input, textarea')) {
        e.preventDefault();
        setIsSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Double-click → fit-all ──
  const handleDoubleClick = useCallback(() => {
    setViewRange(1, totalChapters);
  }, [totalChapters, setViewRange]);

  // ── Zoom bar actions ──
  const zoomTo = useCallback((newZoom: number) => {
    const currentRange = viewEnd - viewStart;
    const center = viewStart + currentRange / 2;
    const newRange = Math.max(totalChapters / newZoom, 5);
    const clampedRange = Math.min(newRange, totalChapters);
    let newStart = center - clampedRange / 2;
    let newEnd = newStart + clampedRange;
    if (newStart < 1) { newStart = 1; newEnd = 1 + clampedRange; }
    if (newEnd > totalChapters) { newEnd = totalChapters; newStart = totalChapters - clampedRange; }
    setViewRange(newStart, newEnd);
  }, [viewStart, viewEnd, totalChapters, setViewRange]);

  // ── Arc zoom from overview ──
  const handleArcZoom = useCallback((arcId: string) => {
    const arc = arcs.find(a => a.id === arcId);
    if (!arc) return;
    const { start, end } = arcChapterRange(arc);
    if (start === 0 && end === 0) {
      onDrillArc?.(arcId);
      return;
    }
    setViewRange(Math.max(1, start), Math.min(totalChapters, end));
    onDrillArc?.(arcId);
  }, [arcs, totalChapters, setViewRange, onDrillArc]);

  // ── Overview highlight drag (always declared, used in compact mode) ──
  const ovRef = useRef<HTMLDivElement>(null);
  const hlAnchor = useRef({ mouseX: 0, viewStart: 0 });
  const [isHlDragging, setIsHlDragging] = useState(false);

  const onHlMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    hlAnchor.current = { mouseX: e.clientX, viewStart };
    setIsHlDragging(true);
  }, [viewStart]);

  useEffect(() => {
    if (!isHlDragging) return;
    const ov = ovRef.current;
    if (!ov) return;
    const ovWidth = ov.getBoundingClientRect().width;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - hlAnchor.current.mouseX;
      const { totalChapters: tc, viewEnd: ve, viewStart: vs } = stateRef.current;
      const currentRange = ve - vs;
      const chDelta = (deltaX / ovWidth) * tc;
      let newStart = hlAnchor.current.viewStart + chDelta;
      let newEnd = newStart + currentRange;
      if (newStart < 1) { newStart = 1; newEnd = 1 + currentRange; }
      if (newEnd > tc) { newEnd = tc; newStart = tc - currentRange; }
      setViewRange(newStart, newEnd);
    };
    const onMouseUp = () => setIsHlDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isHlDragging, setViewRange]);

  // ── Compact / Overview mode ──
  if (compact) {
    const arcRanges = arcs.map(arc => {
      const { start, end } = arcChapterRange(arc);
      return { arc, start, end, hasData: start > 0 && end > 0 };
    });

    // Build chapter→act index for "卷X~卷Y" display
    const chToAct = new Map<number, number>();
    acts.forEach((act, idx) => {
      for (const ch of act.chapters || []) {
        if (ch.numerate) chToAct.set(ch.numerate, idx + 1);
      }
    });
    const actLabel = (startCh: number, endCh: number): string | null => {
      if (chToAct.size === 0) return null;
      let minAct = Infinity, maxAct = -Infinity;
      for (let ch = Math.floor(startCh); ch <= Math.ceil(endCh); ch++) {
        const a = chToAct.get(ch);
        if (a !== undefined) { if (a < minAct) minAct = a; if (a > maxAct) maxAct = a; }
      }
      if (minAct > maxAct) return null;
      if (minAct === maxAct) return `卷${minAct}`;
      return `卷${minAct}~卷${maxAct}`;
    };
    const progress = Math.round((currentChapter / totalChapters) * 100);
    const hlLeft = ((viewStart - 1) / totalChapters) * 100;
    const hlWidth = (range / totalChapters) * 100;

    return (
      <div className="nr-overview">
        {plotTitle && <div className="nr-ov-title">{plotTitle}</div>}
        <div className="nr-ov-meta">全书 · {totalChapters} 章 · 进度 {progress}%（ch {currentChapter}）</div>
        <div className="nr-ov-track-container" ref={ovRef}>
          <div className="nr-ov-tl-bg" />
          <div className="nr-ov-ph-row">
            {PHASES.map((p, i) => (
              <div key={p.label} className="nr-ov-ph" style={{ flex: i < 3 ? "0 0 25%" : 1 }}>{p.label}</div>
            ))}
          </div>
          <div className="nr-ov-track">
            {arcRanges.map(({ arc, start, end }) => {
              const l = ((start - 1) / totalChapters) * 100;
              const w = ((end - start) / totalChapters) * 100;
              const isActive = currentChapter >= start && currentChapter <= end;
              const hasChapters = start > 0 && end > 0;
              return (
                <div
                  key={arc.id}
                  className={`nr-ov-seg${isActive ? " active" : ""}`}
                  style={{ position: "absolute", left: hasChapters ? `${l}%` : `${(arc.sort_order / Math.max(arcs.length, 1)) * 100}%`, width: hasChapters ? `${w}%` : undefined, minWidth: hasChapters ? undefined : 40, opacity: hasChapters ? 1 : 0.4, border: hasChapters ? undefined : "1px dashed rgba(212,168,75,0.25)" }}
                  onClick={() => hasChapters && handleArcZoom(arc.id)}
                >
                  <span className="nr-ov-name">{arc.title || "Arc"}</span>
                  {hasChapters && <span className="nr-ov-ch">{actLabel(start, end) ?? `ch ${Math.round(start)}~${Math.round(end)}`}</span>}
                </div>
              );
            })}
            <div
              className={`nr-ov-highlight${isHlDragging ? " is-dragging" : ""}`}
              style={{
                left: `${hlLeft}%`,
                width: `${hlWidth}%`,
                pointerEvents: hlWidth < 98 ? "auto" : "none",
              }}
              onMouseDown={onHlMouseDown}
            />
          </div>
          {[25, 50, 75].map(pct => (
            <div key={pct} className="nr-ov-tick" style={{ left: `${pct}%` }} />
          ))}
          {playhead != null && onPlayheadChange && (
            <Playhead
              chapter={playhead}
              viewStart={1}
              viewEnd={totalChapters}
              totalChapters={totalChapters}
              containerRef={ovRef}
              onChange={onPlayheadChange}
            />
          )}
          {/* Current chapter cursor (manuscript progress) */}
          <div style={{ position: "absolute", left: `${((currentChapter - 1) / totalChapters) * 100}%`, top: 0, bottom: 0, zIndex: 5, pointerEvents: "none" }}>
            <CursorLine chapter={currentChapter} />
          </div>
        </div>
      </div>
    );
  }

  // ── Full timeline mode ──
  const arcTitleH = 18;
  const phaseTrackH = 28;
  const trackGap = 24;
  const readerTrackH = 42;
  const darkTrackH = 42;
  const numDarkTracks = showDarkLines ? darkTracksVisible.length : 0;
  const totalH = arcTitleH + phaseTrackH + trackGap + readerTrackH + (numDarkTracks > 0 ? numDarkTracks * (darkTrackH + trackGap) : 0);
  const ticksH = 20;
  // Dynamic min segment width: at least half a chapter
  const minSegW = range > 0 ? Math.max(50 / range, 0.3) : 0.3;

  return (
    <div className="narrative-ruler">

      {/* ── Zoom bar (top-left) ── */}
      <div className="nr-zoom-bar">
        <button className="nr-zoom-btn" onClick={() => zoomTo(zoom / 1.3)}>−</button>
        <input
          type="range"
          className="nr-zoom-slider"
          min={1}
          max={20}
          step={0.1}
          value={Math.min(zoom, 20)}
          onChange={e => zoomTo(parseFloat(e.target.value))}
        />
        <button className="nr-zoom-btn" onClick={() => zoomTo(zoom * 1.3)}>+</button>
        <button className="nr-zoom-fit" onClick={() => setViewRange(1, totalChapters)}>Fit</button>
        <span className="nr-zoom-label">{zoom.toFixed(1)}x</span>
        {addNodeSlot}
      </div>

      {/* Timeline wrapper — scroll/drag/zoom target */}
      <div style={{ position: "relative" }}>
      <div
        className="nr-tl-wrap"
        ref={containerRef}
        style={{ minHeight: totalH + ticksH, overflow: "hidden", cursor: isDragging || isSpaceHeld ? "grabbing" : isSpaceHeld ? "grab" : undefined }}
        onMouseDown={isSpaceHeld || isDragging ? handleMouseDown : undefined}
        onDoubleClick={handleDoubleClick}
      >
        {/* Drag area (covers timeline area below arc titles) */}
        {!isSpaceHeld && (
          <div
            className="nr-drag-area"
            style={{ top: arcTitleH }}
            onMouseDown={handleMouseDown}
          />
        )}

        <div className="nr-tl-bg" style={{ top: arcTitleH }} />

        {/* Arc titles — top of timeline, scrolls with content */}
        <div className="nr-arc-title-row" style={{ top: 0, height: arcTitleH }}>
          {arcs.map((arc) => {
            const { start: arcStart, end: arcEnd } = arcChapterRange(arc);
            const hasChapters = arcStart > 0 && arcEnd > 0;
            const left = hasChapters ? toPct(arcStart) : (arc.sort_order / Math.max(arcs.length, 1)) * 100;
            const width = hasChapters ? toPct(arcEnd) - left : undefined;
            return (
              <div key={arc.id} className="nr-arc-title-block" style={{ left: `${left}%`, width: width != null ? `${width}%` : undefined, minWidth: width != null ? undefined : 40 }}>
                <span>{arc.title || "Arc"}</span>
              </div>
            );
          })}
        </div>

        {/* Phase track — phase labels only */}
        <div className="nr-phase-track" style={{ top: arcTitleH, height: phaseTrackH }}>
          {arcs.map((arc) => {
            const { start: arcStart, end: arcEnd } = arcChapterRange(arc);
            if (arcStart === 0 && arcEnd === 0) return null;
            const arcLeft = toPct(arcStart);
            const arcWidth = toPct(arcEnd) - arcLeft;
            return (
              <div key={arc.id} className="nr-arc-phase-group" style={{ left: `${arcLeft}%`, width: `${arcWidth}%` }}>
                {PHASES.map((p) => {
                  const pStart = arcStart + p.range[0] * (arcEnd - arcStart);
                  const pEnd = arcStart + p.range[1] * (arcEnd - arcStart);
                  const pl = ((pStart - arcStart) / (arcEnd - arcStart)) * 100;
                  const pw = ((pEnd - arcStart) / (arcEnd - arcStart)) * 100 - pl;
                  return (
                    <div key={p.label} className="nr-phase-block" style={{ left: `${pl}%`, width: `${pw}%` }}>
                      <span className="nr-phase-name">{p.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Reader track ── */}
        <div className="nr-reader-track" style={{ position: "absolute", top: arcTitleH + phaseTrackH + trackGap, left: 0, right: 0, height: readerTrackH }}>
          <div className="nr-track-label">读者视角</div>
          {mainSubVisible.map(fn => (
            <SegClip key={fn.node.id} fn={fn} minSegW={minSegW} onDoubleClick={onDoubleClickNode} onContextMenu={onContextMenuNode} />
          ))}
        </div>

        {/* ── Dark line tracks ── */}
        {darkTracksVisible.map((track, i) => (
          <div
            key={track.lineId}
            className="nr-dark-track"
            style={{ top: arcTitleH + phaseTrackH + trackGap + readerTrackH + trackGap + i * (darkTrackH + trackGap), height: darkTrackH }}
          >
            <div className="nr-track-label nr-track-label-dark">暗线 · {track.lineTitle}</div>
            {track.nodes.map(fn => (
              <DarkSegClip key={fn.node.id} fn={fn} minSegW={minSegW} onDoubleClick={onDoubleClickNode} onContextMenu={onContextMenuNode} />
            ))}
            {linkPositionsVisible.map((pct, j) => (
              <PlotLinkArrow key={j} leftPct={pct} />
            ))}
          </div>
        ))}

        {/* ── Chapter tick scale ── */}
        <div className="nr-chapter-ticks" style={{ position: "absolute", top: totalH, left: 0, right: 0, height: ticksH }}>
          {ticks.map(t => (
            <div key={t.ch} className="nr-ch-tick" style={{ left: `${t.leftPct}%` }}>
              <div className="nr-ch-tick-line" />
              <span className="nr-ch-label">{Math.round(t.ch)}</span>
            </div>
          ))}
        </div>

      </div>

      {/* ── Playhead + CursorLine (outside scroll container) ── */}
      {playhead != null && onPlayheadChange && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 15, pointerEvents: "none" as const }}>
          <Playhead
            chapter={playhead}
            viewStart={viewStart}
            viewEnd={viewEnd}
            totalChapters={totalChapters}
            containerRef={containerRef}
            onChange={onPlayheadChange}
          />
        </div>
      )}

      {/* Current chapter cursor (manuscript progress) */}
      <div style={{ position: "absolute", left: `${((currentChapter - viewStart) / range) * 100}%`, top: 0, bottom: 0, zIndex: 5, pointerEvents: "none" }}>
        <CursorLine chapter={currentChapter} labelBelow />
      </div>

      </div>

    </div>
  );
}

export default NarrativeRuler;
