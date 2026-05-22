import { useMemo, useState, useCallback } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingThreadNode, WritingThread } from "../../api/writing";

// ── Node type visual config ──

const NODE_META: Record<
  WritingThreadNode["type"],
  { label: string; color: string; shape: "circle" | "diamond" | "triangle" | "cross" | "check" }
> = {
  event: { label: "事件", color: "#94a3b8", shape: "circle" },
  emergence: { label: "浮现", color: "#60a5fa", shape: "triangle" },
  crossing: { label: "交叉", color: "#fbbf24", shape: "cross" },
  resolution: { label: "收束", color: "#4ade80", shape: "check" },
  seed: { label: "伏笔", color: "#c084fc", shape: "diamond" },
};

// ── Layout constants ──

const LEFT_MARGIN = 120;
const COL_MIN_WIDTH = 100;
const HEADER_HEIGHT = 44;
const LANE_HEIGHT = 48;
const LANE_GAP = 10;
const NODE_R = 5;
const LINE_THICK = 5;
const PARALLEL_GAP = 16;

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
  colIndex: number;
  threadIndex: number;
}

interface Waypoint {
  x: number;
  y: number;
}

// ── 45° subway path builder ──
// Draws thick marker-like lines with 45° transitions and rounded corners

function buildSubwayPath(waypoints: Waypoint[]): string {
  if (waypoints.length < 2) {
    return waypoints.length === 1 ? `M ${waypoints[0].x},${waypoints[0].y}` : "";
  }

  const parts: string[] = [`M ${waypoints[0].x},${waypoints[0].y}`];

  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;

    if (dy === 0) {
      // Same Y: straight horizontal
      parts.push(`L ${curr.x},${curr.y}`);
    } else {
      const absDy = Math.abs(dy);
      if (dx >= absDy) {
        // 45° diagonal fits: horizontal → diagonal
        const diagStartX = curr.x - absDy;
        parts.push(`L ${diagStartX},${prev.y}`);
        parts.push(`L ${curr.x},${curr.y}`);
      } else {
        // Not enough horizontal space, direct line
        parts.push(`L ${curr.x},${curr.y}`);
      }
    }
  }

  return parts.join(" ");
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

  // Find main thread index
  const mainThreadIndex = useMemo(
    () => Math.max(0, threads.findIndex((t) => t.type === "main")),
    [threads],
  );

  return { chapters, threads, placedNodes, mainThreadIndex };
}

// ── Convergence state machine ──
// emergence/resolution → converge to main
// seed → diverge back to own lane
// crossing → temporary converge (just this node)
// event → keep current state

const CONVERGE_ACTION: Record<WritingThreadNode["type"], "converge" | "diverge" | "keep"> = {
  emergence: "converge",
  crossing: "converge",
  resolution: "converge",
  seed: "diverge",
  event: "keep",
};

// ── Compute thread waypoints with auto-convergence ──

function computeThreadWaypoints(
  thread: WritingThread,
  threadIndex: number,
  mainThreadIndex: number,
  nodes: PlacedNode[],
  getY: (idx: number) => number,
  getX: (colIndex: number) => number,
): { waypoints: Waypoint[]; nodePositions: { x: number; y: number; pn: PlacedNode }[] } {
  const homeY = getY(threadIndex);
  const mainY = getY(mainThreadIndex);
  const isMain = thread.type === "main";

  // Convergence offset: threads stack relative to main
  const offset = isMain ? 0 : (threadIndex - mainThreadIndex) * PARALLEL_GAP;
  const convergedY = mainY + offset;

  const sortedNodes = nodes
    .filter((n) => n.colIndex >= 0)
    .sort((a, b) => a.colIndex - b.colIndex);

  if (sortedNodes.length === 0) return { waypoints: [], nodePositions: [] };

  let converged = isMain; // main is always at its home (which is its convergedY)
  const nodePositions: { x: number; y: number; pn: PlacedNode }[] = [];
  const waypoints: Waypoint[] = [];

  for (let i = 0; i < sortedNodes.length; i++) {
    const pn = sortedNodes[i];
    const action = CONVERGE_ACTION[pn.node.type];

    // Update convergence state
    if (action === "converge") {
      converged = true;
    } else if (action === "diverge") {
      converged = false;
    }
    // "keep" does not change state

    // Crossing: temporarily converge for this node only
    const isCrossing = pn.node.type === "crossing";
    const effectiveConverged = converged || isCrossing;
    const y = effectiveConverged ? convergedY : homeY;
    const x = getX(pn.colIndex);

    waypoints.push({ x, y });
    nodePositions.push({ x, y, pn });

    // If crossing, insert a diverge waypoint right after (to go back)
    if (isCrossing && !converged) {
      // Add a waypoint slightly to the right, back at homeY
      // This creates the "dip in, dip out" visual
      const nextX = i < sortedNodes.length - 1
        ? getX(sortedNodes[i + 1].colIndex)
        : x + COL_MIN_WIDTH * 0.4;
      const midX = (x + nextX) / 2;
      waypoints.push({ x: midX, y: homeY });
    }
  }

  return { waypoints, nodePositions };
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

  switch (NODE_META[type].shape) {
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
          <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
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
      return <circle cx={cx} cy={cy} r={r} fill={color} stroke="#09090b" strokeWidth={2} />;
  }
}

// ── Main Component ──

export function ThreadTimelineView({
  onNodeClick,
}: {
  onNodeClick?: (threadId: string, nodeId: string) => void;
}) {
  const { chapters, threads, placedNodes, mainThreadIndex } = useTimelineData();
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const colWidth = COL_MIN_WIDTH * zoom;

  const getY = useCallback(
    (threadIndex: number) => HEADER_HEIGHT + threadIndex * (LANE_HEIGHT + LANE_GAP) + LANE_HEIGHT / 2,
    [],
  );

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
    for (const [, nodes] of m) {
      nodes.sort((a, b) => a.colIndex - b.colIndex);
    }
    return m;
  }, [placedNodes]);

  // Compute waypoints for each thread
  const threadPaths = useMemo(() => {
    const result: {
      threadId: string;
      thread: WritingThread;
      threadIndex: number;
      path: string;
      nodePositions: { x: number; y: number; pn: PlacedNode }[];
    }[] = [];

    for (let ti = 0; ti < threads.length; ti++) {
      const thread = threads[ti];
      const nodes = threadNodeMap.get(thread.id) || [];
      const { waypoints, nodePositions } = computeThreadWaypoints(
        thread, ti, mainThreadIndex, nodes, getY, getX,
      );
      result.push({
        threadId: thread.id,
        thread,
        threadIndex: ti,
        path: buildSubwayPath(waypoints),
        nodePositions,
      });
    }

    return result;
  }, [threads, threadNodeMap, mainThreadIndex, getY, getX]);

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
    <div className="rounded-lg border border-zinc-700/60 bg-[#0f0f12] overflow-hidden">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/60">
        <span className="text-[11px] text-zinc-500">缩放</span>
        <input
          type="range" min={0.5} max={3} step={0.1} value={zoom}
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
          {/* ── Layer 1: Chapter grid (very subtle) ── */}
          <g opacity={0.15}>
            {chapters.map((ch, i) => {
              const isNewAct = i === 0 || ch.actId !== chapters[i - 1]?.actId;
              return (
                <g key={ch.id}>
                  {isNewAct && i > 0 && (
                    <line
                      x1={LEFT_MARGIN + i * colWidth} y1={0}
                      x2={LEFT_MARGIN + i * colWidth} y2={totalHeight}
                      stroke="#3f3f46" strokeWidth={1} strokeDasharray="6 3"
                    />
                  )}
                  <line x1={getX(i)} y1={HEADER_HEIGHT} x2={getX(i)} y2={totalHeight} stroke="#27272a" strokeWidth={1} />
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
                  <text x={x} y={isNewAct ? 28 : 22} textAnchor="middle" fill="#52525b" fontSize={10}>
                    {ch.title}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Header separator */}
          <line x1={0} y1={HEADER_HEIGHT} x2={totalWidth} y2={HEADER_HEIGHT} stroke="#27272a" strokeWidth={1} />

          {/* ── Layer 3: Thread labels ── */}
          {threads.map((thread, ti) => {
            const y = getY(ti);
            const isDormant = thread.status === "dormant";
            return (
              <g key={`label-${thread.id}`}>
                <text
                  x={LEFT_MARGIN - 8} y={y + 3} textAnchor="end"
                  fill={thread.color} fontSize={11} fontWeight={700}
                  opacity={isDormant ? 0.4 : 0.9}
                >
                  {thread.name || "未命名"}
                </text>
                <text x={LEFT_MARGIN - 8} y={y + 14} textAnchor="end" fill="#3f3f46" fontSize={8}>
                  {thread.type === "main" ? "主线" : thread.type === "subplot" ? "支线" : "暗线"}
                </text>
              </g>
            );
          })}

          {/* ── Layer 4: Thread subway lines (thick, 45°, auto-converge) ── */}
          {threadPaths.map(({ threadId, thread, path }) => {
            const isDark = thread.type === "dark";
            const isDormant = thread.status === "dormant";
            if (!path) return null;

            return (
              <path
                key={`path-${threadId}`}
                d={path}
                fill="none"
                stroke={thread.color}
                strokeWidth={LINE_THICK}
                strokeOpacity={isDormant ? 0.3 : 0.8}
                strokeDasharray={isDark ? "12 6" : "none"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* ── Layer 5: Node markers ── */}
          {threadPaths.map(({ threadId, thread, nodePositions }) => (
            <g key={`nodes-${threadId}`}>
              {nodePositions.map(({ x, y, pn }) => {
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
                    {/* Hover glow */}
                    {isHovered && (
                      <circle cx={x} cy={y} r={NODE_R + 6} fill="none" stroke={thread.color} strokeWidth={1.5} strokeOpacity={0.5} />
                    )}
                    {/* Seed outer ring */}
                    {pn.node.type === "seed" && (
                      <circle cx={x} cy={y} r={NODE_R + 3} fill="none" stroke={meta.color} strokeWidth={1} strokeOpacity={0.4} />
                    )}
                    {/* Node shape */}
                    <NodeMarker cx={x} cy={y} type={pn.node.type} color={meta.color} isHovered={isHovered} />
                    {/* Tooltip */}
                    {isHovered && (
                      <g>
                        <rect x={x - 70} y={y - 32} width={140} height={22} rx={4} fill="#18181b" stroke="#3f3f46" strokeWidth={1} />
                        <text x={x} y={y - 17} textAnchor="middle" fill="#e4e4e7" fontSize={10} fontWeight={500} pointerEvents="none">
                          {pn.node.title || meta.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
