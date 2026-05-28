import { useState } from "react";
import { useWritingStore } from "../../../stores/useWritingStore";
import {
  PLOT_BEAT_KIND_LABELS, PLOT_BEAT_KIND_COLORS, PLOT_BEAT_STATUS_LABELS,
  PLOT_LINE_TYPE_LABELS,
  type PlotArc, type PlotLine, type PlotNode, type PlotBeat,
  type PlotBeatKind, type PlotLineType, type PlotBeatStatus,
} from "../../../api/writing";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical } from "lucide-react";


// ── Kind Chip ──

function KindChip({ kind }: { kind: PlotBeatKind }) {
  const color = PLOT_BEAT_KIND_COLORS[kind] || "#6b7280";
  return (
    <span
      className="inline-flex items-center h-[20px] px-1.5 rounded text-[10px] font-semibold shrink-0"
      style={{ color, background: color + "20" }}
    >
      {PLOT_BEAT_KIND_LABELS[kind]}
    </span>
  );
}

// ── Status Chip ──

function StatusChip({ status }: { status: PlotBeatStatus }) {
  const colors: Record<PlotBeatStatus, string> = {
    planted: "#eab308", resolved: "#22c55e", abandoned: "#6b7280",
  };
  return (
    <span
      className="inline-flex items-center h-[18px] px-1 rounded text-[9px] font-medium shrink-0"
      style={{ color: colors[status], background: colors[status] + "20" }}
    >
      {PLOT_BEAT_STATUS_LABELS[status]}
    </span>
  );
}

// ── Line Type Badge ──

function LineTypeBadge({ type }: { type: PlotLineType }) {
  const colors: Record<PlotLineType, string> = { main: "#3b82f6", subplot: "#22c55e", dark: "#a855f7" };
  return (
    <span
      className="inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-medium"
      style={{ color: colors[type], background: colors[type] + "20" }}
    >
      {PLOT_LINE_TYPE_LABELS[type]}
    </span>
  );
}


// ── Beat Row ──

function BeatRow({ beat }: { beat: PlotBeat }) {
  const [editing, setEditing] = useState(false);
  const updateBeat = useWritingStore((s) => s.updateBeatAction);
  const deleteBeat = useWritingStore((s) => s.deleteBeatAction);

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 group hover:bg-zinc-800/30 rounded">
      <GripVertical className="w-3 h-3 text-zinc-600 mt-1 shrink-0 cursor-grab" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            className="w-full bg-transparent text-[13px] text-zinc-200 outline-none border-b border-zinc-600 pb-0.5"
            defaultValue={beat.summary}
            onBlur={(e) => { updateBeat(beat.id, { summary: e.target.value }); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
          />
        ) : (
          <p
            className="text-[13px] text-zinc-300 cursor-pointer hover:text-zinc-100 truncate"
            onClick={() => setEditing(true)}
            title={beat.summary || "点击编辑"}
          >
            {beat.summary || "未填写"}
          </p>
        )}
        {beat.effect && (
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{beat.effect}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <KindChip kind={beat.kind} />
        <StatusChip status={beat.status} />
      </div>
      <button
        onClick={() => deleteBeat(beat.id)}
        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}


// ── Node Section ──

function NodeSection({ node }: { node: PlotNode }) {
  const [expanded, setExpanded] = useState(true);
  const createBeat = useWritingStore((s) => s.createBeatAction);

  return (
    <div className="ml-4 border-l border-zinc-700/50 pl-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 hover:text-zinc-100 py-1 w-full text-left"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="truncate">{node.title || "未命名节点"}</span>
        {node.scene_ids.length > 0 && (
          <span className="text-[10px] text-zinc-500">{node.scene_ids.length} scenes</span>
        )}
      </button>

      {expanded && (
        <div className="mt-1">
          {(node.beats || []).map((beat) => (
            <BeatRow key={beat.id} beat={beat} />
          ))}
          <button
            onClick={() => createBeat(node.id)}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 py-1 px-2"
          >
            <Plus className="w-3 h-3" /> 添加节拍
          </button>
        </div>
      )}
    </div>
  );
}


// ── Line Section ──

function LineSection({ line }: { line: PlotLine }) {
  const [expanded, setExpanded] = useState(true);
  const createNode = useWritingStore((s) => s.createNodeAction);
  const deleteLine = useWritingStore((s) => s.deleteLineAction);

  return (
    <div className="border border-zinc-700/40 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40">
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
        </button>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: line.color }}
        />
        <span className="text-[13px] font-medium text-zinc-200 truncate flex-1">
          {line.title || line.name || "未命名线"}
        </span>
        <LineTypeBadge type={line.type} />
        <button
          onClick={() => deleteLine(line.id)}
          className="text-zinc-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="py-2">
          {(line.nodes || []).map((node) => (
            <NodeSection key={node.id} node={node} />
          ))}
          <div className="ml-4 pl-3">
            <button
              onClick={() => createNode(line.id)}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 py-1 px-2"
            >
              <Plus className="w-3 h-3" /> 添加节点
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Arc Section ──

function ArcSection({ arc }: { arc: PlotArc }) {
  const [expanded, setExpanded] = useState(true);
  const createLine = useWritingStore((s) => s.createLineAction);
  const deleteArc = useWritingStore((s) => s.deleteArcAction);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        </button>
        <h3 className="text-[14px] font-semibold text-zinc-200 flex-1">
          {arc.title || "未命名阶段"}
        </h3>
        <button
          onClick={() => deleteArc(arc.id)}
          className="text-zinc-500 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 pl-2">
          {(arc.lines || []).map((line) => (
            <LineSection key={line.id} line={line} />
          ))}
          <button
            onClick={() => createLine(arc.id)}
            className="flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-300 py-1.5 px-3 border border-dashed border-zinc-700 rounded-lg w-full"
          >
            <Plus className="w-3.5 h-3.5" /> 添加剧情线
          </button>
        </div>
      )}
    </div>
  );
}


// ── PlotPanel (main) ──

export function PlotPanel() {
  const plotTree = useWritingStore((s) => s.plotTree);
  const createArc = useWritingStore((s) => s.createArcAction);

  if (!plotTree) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        选择一个项目以查看剧情结构
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-4 py-3 border-b border-zinc-700/50">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-zinc-200">剧情编排</h2>
          <button
            onClick={() => createArc("新阶段")}
            className="flex items-center gap-1 text-[12px] text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 px-2.5 py-1 rounded"
          >
            <Plus className="w-3.5 h-3.5" /> 新阶段
          </button>
        </div>
        {plotTree.title && (
          <p className="text-[12px] text-zinc-500 mt-1">{plotTree.title}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {(plotTree.arcs || []).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-[13px]">还没有剧情阶段</p>
            <p className="text-zinc-600 text-[12px] mt-1">点击「新阶段」开始规划</p>
          </div>
        ) : (
          (plotTree.arcs || []).map((arc) => (
            <ArcSection key={arc.id} arc={arc} />
          ))
        )}
      </div>
    </div>
  );
}
