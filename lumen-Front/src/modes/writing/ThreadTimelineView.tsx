import { useMemo, useState, useCallback } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingThreadNode, WritingThread } from "../../api/writing";

// ── Node type visual config ──

const NODE_META: Record<
  WritingThreadNode["type"],
  { label: string; color: string; shape: "circle" | "diamond" | "triangle" | "cross" | "check" }
> = {
  event: { label: "事件", color: "#94a3b8", shape: "circle" },
  emergence: { label: "浮现", color: "#3b82f6", shape: "triangle" },
  crossing: { label: "交叉", color: "#f59e0b", shape: "cross" },
  resolution: { label: "收束", color: "#22c55e", shape: "check" },
  seed: { label: "伏笔", color: "#a855f7", shape: "diamond" },
};

// ── Layout constants ──

const LEFT_MARGIN = 110;
const COL_MIN_WIDTH = 90;
const HEADER_HEIGHT = 42;
const LANE_HEIGHT = 52;
const LANE_GAP = 6;
const NODE_R = 6;
const LINE_THICK = 3;

// ── Types ──

interface FlatChapter {
  id: string;
  actId: string;
  actTitle: string;
  title: string;
  order: number;
}

interface PlacedNode {
  node: WritingThreadNode;
  threadId: string;
  colIndex: number; // -1 = unplaced
  threadIndex: number;
}

// ── Data hook ──

function useTimelineData() {
  const acts = useWritingStore((s) => s.acts);
  const threads = useWritingStore((s) => s.threads);
  const threadNodes = useWritingStore((s) => s.threadNodes);

  const chapters: FlatChapter[] = useMemo(() => {
    const result: FlatChapter[] = [];
    for (const act of acts) {
      for (const ch of (act as any).chapters || []) {
        result.push({
          id: ch.id,
          actId: act.id,
          actTitle: act.title || `Act ${(act.sort_order ?? 0) + 1}`,
          title: ch.title || `Ch ${(ch.sort_order ?? 0) + 1}`,
          order: result.length,
        });
      }
    }
    return result;
  }, [acts]);

  const chIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    chapters.forEach((ch, i) => m.set(ch.id, i));
    return m;
  }, [chapters]);

  const sceneToChapter = useMemo(() => {
    const m = new Map<string, string>();
    for (const act of acts) {
      for (const ch of (act as any).chapters || []) {
        for (const sc of ch.scenes || []) {
          m.set(sc.id, ch.id);
        }
      }
    }
    return m;
  }, [acts]);

  const threadIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    threads.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [threads]);

  const placedNodes: PlacedNode[] = useMemo(() => {
    const result: PlacedNode[] = [];
    for (const thread of threads) {
      const nodes = threadNodes[thread.id] || [];
      const ti = threadIndexMap.get(thread.id) ?? 0;
      for (const node of nodes) {
        let colIndex = -1;
        if (node.scene_id) {
          const chId = sceneToChapter.get(node.scene_id);
          if (chId) colIndex = chIdToIndex.get(chId) ?? -1;
        }
        result.push({ node, threadId: thread.id, colIndex, threadIndex: ti });
      }
    }
    return result;
  }, [threads, threadNodes, sceneToChapter, chIdToIndex, threadIndexMap]);

  // Per-chapter: which threads have nodes there?
  const chapterThreadMap = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const pn of placedNodes) {
      if (pn.colIndex < 0) continue;
      if (!m.has(pn.colIndex)) m.set(pn.colIndex, new Set());
      m.get(pn.colIndex)!.add(pn.threadId);
    }
    return m;
  }, [placedNodes]);

  return { chapters, threads, placedNodes, threadIndexMap, chapterThreadMap };
}

// ── SVG shape renderers ──

function NodeMarker({
  cx,
  cy,
  type,
  color,
  isHovered,
}: {
  cx: number;
  cy: number;
  type: WritingThreadNode["type"];
  color: string;
  isHovered: boolean;
}) {
  const r = isHovered ? NODE_R + 2 : NODE_R;
  const meta = NODE_META[type];

  switch (meta.shape) {
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={color}
          stroke="#09090b"
          strokeWidth={2}
        />
      );
    case "triangle":
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r * 0.9},${cy + r * 0.6} ${cx - r * 0.9},${cy + r * 0.6}`}
          fill={color}
          stroke="#09090b"
          strokeWidth={2}
        />
      );
    case "cross": {
      const s = r * 0.75;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="#09090b" stroke={color} strokeWidth={2} />
          <line
            x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s}
            stroke={color} strokeWidth={2.5} strokeLinecap="round"
          />
          <line
            x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s}
            stroke={color} strokeWidth={2.5} strokeLinecap="round"
          />
        </g>
      );
    }
    case "check":
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={color} stroke="#09090b" strokeWidth={2} />
          <polyline
            points={`${cx - r * 0.45},${cy + 0.5} ${cx - r * 0.1},${cy + r * 0.4} ${cx + r * 0.45},${cy - r * 0.35}`}
            fill="none" stroke="#09090b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          />
        </g>
      );
    default:
      return (
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="#09090b" strokeWidth={2} />
      );
  }
}

// ── Junction renderer (transfer station between threads) ──

function JunctionConnector({
  x,
  threadIds,
  threads,
  getY,
}: {
  x: number;
  threadIds: string[];
  threads: WritingThread[];
  getY: (threadIndex: number) => number;
}) {
  if (threadIds.length < 2) return null;

  // Sort threads by index to get top/bottom Y
  const indices = threadIds
    .map((id) => threads.findIndex((t) => t.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  if (indices.length < 2) return null;

  const topY = getY(indices[0]);
  const bottomY = getY(indices[indices.length - 1]);

  return (
    <g>
      {/* Vertical connector bar */}
      <line
        x1={x} y1={topY} x2={x} y2={bottomY}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeOpacity={0.35}
        strokeDasharray="3 3"
      />
      {/* Junction dot at midpoint */}
      <circle
        cx={x}
        cy={(topY + bottomY) / 2}
        r={4}
        fill="#f59e0b"
        fillOpacity={0.5}
        stroke="#f59e0b"
        strokeWidth={1}
        strokeOpacity={0.7}
      />
    </g>
  );
}

// ── Main Component ──

export function ThreadTimelineView({
  onNodeClick,
}: {
  onNodeClick?: (threadId: string, nodeId: string) => void;
}) {
  const { chapters, threads, placedNodes, chapterThreadMap } = useTimelineData();
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const colWidth = COL_MIN_WIDTH * zoom;

  // Y position helper
  const getY = useCallback(
    (threadIndex: number) => HEADER_HEIGHT + threadIndex * (LANE_HEIGHT + LANE_GAP) + LANE_HEIGHT / 2,
    [],
  );

  // X position helper
  const getX = useCallback(
    (colIndex: number) => LEFT_MARGIN + colIndex * colWidth + colWidth / 2,
    [colWidth],
  );

  const totalWidth = LEFT_MARGIN + chapters.length * colWidth + 40;
  const totalHeight = HEADER_HEIGHT + threads.length * (LANE_HEIGHT + LANE_GAP) + 20;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(0.5, Math.min(3, z - e.deltaY * 0.002)));
    }
  }, []);

  // Build per-thread sorted node lists
  const threadNodeMap = useMemo(() => {
    const m = new Map<string, PlacedNode[]>();
    for (const pn of placedNodes) {
      if (!m.has(pn.threadId)) m.set(pn.threadId, []);
      m.get(pn.threadId)!.push(pn);
    }
    // Sort each list by colIndex
    for (const [, nodes] of m) {
      nodes.sort((a, b) => a.colIndex - b.colIndex);
    }
    return m;
  }, [placedNodes]);

  if (chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        暂无章节，无法显示时间线
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        暂无叙事线，添加后可查看时间线
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/30 overflow-hidden">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-700/40 bg-zinc-900/60">
        <span className="text-[11px] text-zinc-500">缩放</span>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-24 accent-zinc-500"
        />
        <span className="text-[10px] text-zinc-600 tabular-nums">{Math.round(zoom * 100)}%</span>
        <span className="text-[10px] text-zinc-600 ml-2">Ctrl+滚轮缩放</span>
        <div className="flex-1" />
        <span className="text-[10px] text-zinc-600">
          {threads.length} 线 · {placedNodes.filter((n) => n.colIndex >= 0).length} 节点
        </span>
      </div>

      <div className="overflow-auto" onWheel={handleWheel} style={{ maxHeight: 420 }}>
        <svg width={totalWidth} height={totalHeight} className="select-none">
          {/* ── Layer 1: Chapter grid ── */}
          <g opacity={0.3}>
            {chapters.map((ch, i) => {
              const x = LEFT_MARGIN + i * colWidth + colWidth / 2;
              const isNewAct = i === 0 || ch.actId !== chapters[i - 1]?.actId;
              return (
                <g key={ch.id}>
                  {/* Act separator */}
                  {isNewAct && i > 0 && (
                    <line
                      x1={LEFT_MARGIN + i * colWidth}
                      y1={0}
                      x2={LEFT_MARGIN + i * colWidth}
                      y2={totalHeight}
                      stroke="#3f3f46"
                      strokeWidth={1}
                      strokeDasharray="6 3"
                    />
                  )}
                  {/* Chapter column guide */}
                  <line
                    x1={x}
                    y1={HEADER_HEIGHT}
                    x2={x}
                    y2={totalHeight}
                    stroke="#27272a"
                    strokeWidth={1}
                  />
                </g>
              );
            })}
          </g>

          {/* ── Layer 2: Chapter headers ── */}
          <g>
            {chapters.map((ch, i) => {
              const x = getX(i);
              const isNewAct = i === 0 || ch.actId !== chapters[i - 1]?.actId;
              return (
                <g key={ch.id}>
                  {isNewAct && (
                    <text x={x} y={14} textAnchor="middle" fill="#52525b" fontSize={9} fontWeight={600}>
                      {ch.actTitle}
                    </text>
                  )}
                  <text
                    x={x}
                    y={isNewAct ? 28 : 22}
                    textAnchor="middle"
                    fill="#71717a"
                    fontSize={10}
                  >
                    {ch.title}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Header separator */}
          <line
            x1={0} y1={HEADER_HEIGHT}
            x2={totalWidth} y2={HEADER_HEIGHT}
            stroke="#3f3f46"
            strokeWidth={1}
          />

          {/* ── Layer 3: Thread subway lines ── */}
          {threads.map((thread, ti) => {
            const y = getY(ti);
            const nodes = threadNodeMap.get(thread.id) || [];
            const placedNodes_ = nodes.filter((n) => n.colIndex >= 0);
            const isDark = thread.type === "dark";
            const isDormant = thread.status === "dormant";

            return (
              <g key={thread.id}>
                {/* Thread label */}
                <text
                  x={LEFT_MARGIN - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={thread.color}
                  fontSize={11}
                  fontWeight={600}
                  opacity={isDormant ? 0.5 : 1}
                >
                  {thread.name || "未命名"}
                </text>
                {/* Thread type indicator */}
                <text
                  x={LEFT_MARGIN - 8}
                  y={y + 14}
                  textAnchor="end"
                  fill="#52525b"
                  fontSize={8}
                >
                  {thread.type === "main" ? "主线" : thread.type === "subplot" ? "支线" : "暗线"}
                </text>

                {/* ── Subway line path ── */}
                {placedNodes_.length >= 2 && (
                  <polyline
                    points={placedNodes_
                      .map((pn) => `${getX(pn.colIndex)},${y}`)
                      .join(" ")}
                    fill="none"
                    stroke={thread.color}
                    strokeWidth={LINE_THICK}
                    strokeOpacity={isDormant ? 0.25 : 0.6}
                    strokeDasharray={isDark ? "8 4" : "none"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Single node: short line stub */}
                {placedNodes_.length === 1 && (
                  <line
                    x1={getX(placedNodes_[0].colIndex) - 12}
                    y1={y}
                    x2={getX(placedNodes_[0].colIndex) + 12}
                    y2={y}
                    stroke={thread.color}
                    strokeWidth={LINE_THICK}
                    strokeOpacity={isDormant ? 0.25 : 0.6}
                    strokeDasharray={isDark ? "8 4" : "none"}
                    strokeLinecap="round"
                  />
                )}

                {/* Unplaced node stubs (right side) */}
                {nodes
                  .filter((n) => n.colIndex < 0)
                  .map((pn, idx) => {
                    const nx = LEFT_MARGIN + chapters.length * colWidth + 16 + idx * 14;
                    return (
                      <g key={pn.node.id}>
                        <circle
                          cx={nx}
                          cy={y}
                          r={3}
                          fill={thread.color}
                          opacity={0.3}
                        />
                      </g>
                    );
                  })}
              </g>
            );
          })}

          {/* ── Layer 4: Junction connectors (where threads share a chapter) ── */}
          {chapters.map((_, ci) => {
            const threadIds = chapterThreadMap.get(ci);
            if (!threadIds || threadIds.size < 2) return null;
            return (
              <JunctionConnector
                key={`junc-${ci}`}
                x={getX(ci)}
                threadIds={Array.from(threadIds)}
                threads={threads}
                getY={getY}
              />
            );
          })}

          {/* ── Layer 5: Node markers (on top) ── */}
          {threads.map((thread, ti) => {
            const y = getY(ti);
            const nodes = threadNodeMap.get(thread.id) || [];

            return (
              <g key={`nodes-${thread.id}`}>
                {nodes
                  .filter((pn) => pn.colIndex >= 0)
                  .map((pn) => {
                    const nx = getX(pn.colIndex);
                    const meta = NODE_META[pn.node.type];
                    const isHovered = hoveredNode === pn.node.id;

                    return (
                      <g
                        key={pn.node.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredNode(pn.node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={() => onNodeClick?.(thread.id, pn.node.id)}
                      >
                        {/* Hover glow ring */}
                        {isHovered && (
                          <circle
                            cx={nx}
                            cy={y}
                            r={NODE_R + 6}
                            fill="none"
                            stroke={thread.color}
                            strokeWidth={1.5}
                            strokeOpacity={0.4}
                          />
                        )}

                        {/* Seed outer ring */}
                        {pn.node.type === "seed" && (
                          <circle
                            cx={nx}
                            cy={y}
                            r={NODE_R + 3}
                            fill="none"
                            stroke={meta.color}
                            strokeWidth={1}
                            strokeOpacity={0.4}
                          />
                        )}

                        {/* Node shape */}
                        <NodeMarker
                          cx={nx}
                          cy={y}
                          type={pn.node.type}
                          color={meta.color}
                          isHovered={isHovered}
                        />

                        {/* Tooltip */}
                        {isHovered && (
                          <g>
                            <rect
                              x={nx - 70}
                              y={y - 32}
                              width={140}
                              height={22}
                              rx={4}
                              fill="#18181b"
                              stroke="#3f3f46"
                              strokeWidth={1}
                            />
                            <text
                              x={nx}
                              y={y - 17}
                              textAnchor="middle"
                              fill="#e4e4e7"
                              fontSize={10}
                              fontWeight={500}
                              pointerEvents="none"
                            >
                              {pn.node.title || meta.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
