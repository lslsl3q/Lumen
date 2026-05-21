import { useState, useCallback, useMemo } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown,
  Circle, Eye, EyeOff, Layers, CheckCircle2, MapPin, List, GitBranch,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingThread, WritingThreadNode } from "../../api/writing";
import { ThreadTimelineView } from "./ThreadTimelineView";

const TYPE_META: Record<WritingThread["type"], { label: string; icon: typeof Eye; color: string }> = {
  main: { label: "明线", icon: Eye, color: "#3b82f6" },
  subplot: { label: "支线", icon: Layers, color: "#22c55e" },
  dark: { label: "暗线", icon: EyeOff, color: "#a855f7" },
};

const STATUS_META: Record<WritingThread["status"], { label: string; icon: typeof Circle; color: string }> = {
  active: { label: "活跃", icon: Circle, color: "#22c55e" },
  dormant: { label: "潜伏", icon: Circle, color: "#6b7280" },
  surfaced: { label: "浮现", icon: Circle, color: "#3b82f6" },
  resolved: { label: "收束", icon: CheckCircle2, color: "#eab308" },
};

const NODE_TYPE_META: Record<WritingThreadNode["type"], { label: string; emoji: string; color: string }> = {
  event: { label: "事件", emoji: "●", color: "#94a3b8" },
  emergence: { label: "浮现", emoji: "↑", color: "#3b82f6" },
  crossing: { label: "交叉", emoji: "✕", color: "#f59e0b" },
  resolution: { label: "收束", emoji: "✓", color: "#22c55e" },
  seed: { label: "伏笔", emoji: "◆", color: "#a855f7" },
};

// ── 类型标签 ──

function TypeBadge({ type }: { type: WritingThread["type"] }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
      style={{ color: meta.color, background: meta.color + "18" }}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: WritingThread["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
      style={{ color: meta.color, background: meta.color + "18" }}>
      <Icon className="w-3 h-3" style={{ fill: "currentColor" }} />
      {meta.label}
    </span>
  );
}

// ── 场景选择器 ──

function ScenePicker({ sceneId, onSelect }: { sceneId: string | null; onSelect: (id: string | null) => void }) {
  const acts = useWritingStore((s) => s.acts);

  const sceneLabel = useMemo(() => {
    if (!sceneId) return null;
    for (const act of acts) {
      for (const ch of (act as any).chapters || []) {
        for (const sc of ch.scenes || []) {
          if (sc.id === sceneId) {
            return `${act.title || "Act"} / ${ch.title || "Ch"} / Sc${(sc.sort_order ?? 0) + 1}`;
          }
        }
      }
    }
    return null;
  }, [acts, sceneId]);

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-zinc-700 hover:border-zinc-600 transition-colors cursor-pointer"
        style={{
          color: sceneId ? "#60a5fa" : "#71717a",
          background: sceneId ? "rgba(59,130,246,0.08)" : "transparent",
        }}
      >
        <MapPin className="w-3 h-3" />
        {sceneLabel || "绑定场景"}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-64 max-h-64 overflow-y-auto p-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl"
      >
        {sceneId && (
          <button
            className="w-full text-left px-2 py-1.5 rounded text-[11px] text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            onClick={() => onSelect(null)}
          >
            ✕ 解除绑定
          </button>
        )}
        {acts.map((act) => (
          <div key={act.id}>
            <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase">
              {act.title || `Act ${(act.sort_order ?? 0) + 1}`}
            </div>
            {((act as any).chapters || []).map((ch: any) => (
              <div key={ch.id}>
                <div className="px-2 py-0.5 text-[10px] text-zinc-500 pl-4">
                  {ch.title || `Ch ${(ch.sort_order ?? 0) + 1}`}
                </div>
                {(ch.scenes || []).map((sc: any) => (
                  <button
                    key={sc.id}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] pl-6 transition-colors cursor-pointer ${
                      sc.id === sceneId ? "bg-blue-500/15 text-blue-400" : "text-zinc-400 hover:bg-zinc-800"
                    }`}
                    onClick={() => onSelect(sc.id)}
                  >
                    Sc{(sc.sort_order ?? 0) + 1} {sc.subtitle && <span className="text-zinc-600">— {sc.subtitle}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
        {acts.length === 0 && (
          <div className="px-2 py-3 text-center text-[11px] text-zinc-500">暂无场景</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── 节点编辑面板 ──

function NodeEditorPanel({ node, onClose }: {
  node: WritingThreadNode;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [note, setNote] = useState(node.note);
  const [storyTime, setStoryTime] = useState(node.story_time);
  const [nodeType, setNodeType] = useState(node.type);
  const [sceneId, setSceneId] = useState(node.scene_id);

  const handleSave = useCallback(() => {
    useWritingStore.getState().updateThreadNodeAction(node.id, {
      title: title.trim(),
      note: note.trim(),
      story_time: storyTime.trim(),
      type: nodeType,
      scene_id: sceneId,
    });
    onClose();
  }, [node.id, title, note, storyTime, nodeType, sceneId, onClose]);

  return (
    <div className="border-t border-zinc-700/60 bg-zinc-900/50 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: NODE_TYPE_META[nodeType]?.color }}>
            {NODE_TYPE_META[nodeType]?.emoji}
          </span>
          <select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as WritingThreadNode["type"])}
            className="bg-transparent text-[11px] text-zinc-300 outline-none cursor-pointer border border-zinc-700 rounded px-1 py-0.5"
          >
            {(Object.entries(NODE_TYPE_META) as [WritingThreadNode["type"], typeof NODE_TYPE_META[WritingThreadNode["type"]]][]).map(([k, m]) => (
              <option key={k} value={k}>{m.emoji} {m.label}</option>
            ))}
          </select>
        </div>
        <button onClick={handleSave} className="text-[11px] px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors cursor-pointer">
          保存
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="节点标题…"
        className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600 border-b border-zinc-800 pb-1"
        autoFocus
      />

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="备注…"
        className="w-full min-h-[40px] bg-transparent text-xs text-zinc-400 outline-none resize-none placeholder:text-zinc-600"
        rows={2}
      />

      <div className="flex items-center gap-2">
        <ScenePicker sceneId={sceneId} onSelect={setSceneId} />
        <input
          value={storyTime}
          onChange={(e) => setStoryTime(e.target.value)}
          placeholder="故事内时间（可选）"
          className="flex-1 bg-transparent text-[11px] text-zinc-500 outline-none placeholder:text-zinc-700"
        />
      </div>
    </div>
  );
}

// ── 线程卡片 ──

function ThreadCard({ thread }: { thread: WritingThread }) {
  const threadNodes = useWritingStore((s) => s.threadNodes[thread.id] || []);
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameText, setNameText] = useState(thread.name);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const handleNameBlur = useCallback(() => {
    setEditingName(false);
    if (nameText.trim() !== thread.name) {
      useWritingStore.getState().updateThreadAction(thread.id, { name: nameText.trim() });
    }
  }, [thread.id, thread.name, nameText]);

  const handleDelete = useCallback(() => {
    useWritingStore.getState().deleteThreadAction(thread.id);
  }, [thread.id]);

  const handleAddNode = useCallback((type: WritingThreadNode["type"]) => {
    useWritingStore.getState().createThreadNodeAction(thread.id, type);
  }, [thread.id]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    useWritingStore.getState().deleteThreadNodeAction(nodeId);
    if (editingNodeId === nodeId) setEditingNodeId(null);
  }, [editingNodeId]);

  const handleStatusChange = useCallback((status: WritingThread["status"]) => {
    useWritingStore.getState().updateThreadAction(thread.id, { status });
  }, [thread.id]);

  const editingNode = editingNodeId ? threadNodes.find((n) => n.id === editingNodeId) : null;

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-zinc-800/60 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-zinc-500">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: thread.color }}
        />
        {editingName ? (
          <input
            value={nameText}
            onChange={(e) => setNameText(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="flex-1 bg-transparent text-sm font-medium text-zinc-200 outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium text-zinc-200 truncate"
            onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
          >
            {thread.name || "未命名叙事线"}
          </span>
        )}
        <TypeBadge type={thread.type} />
        <StatusBadge status={thread.status} />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.entries(NODE_TYPE_META) as [string, { label: string; emoji: string }][]).map(([type, meta]) => (
              <DropdownMenuItem key={type} onClick={() => handleAddNode(type as WritingThreadNode["type"])}>
                <span className="mr-1.5">{meta.emoji}</span>
                添加{meta.label}节点
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              const statuses: WritingThread["status"][] = ["active", "dormant", "surfaced", "resolved"];
              const idx = statuses.indexOf(thread.status);
              handleStatusChange(statuses[(idx + 1) % statuses.length]);
            }}>
              切换状态
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              删除叙事线
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-[11px] text-zinc-500 tabular-nums">{threadNodes.length} 节点</span>
      </div>

      {/* Nodes list */}
      {expanded && (
        <div className="border-t border-zinc-700/40">
          {threadNodes.map((node) => (
            <div key={node.id}>
              {/* Node row */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                  editingNodeId === node.id
                    ? "bg-zinc-800/80"
                    : "hover:bg-zinc-700/20"
                }`}
                onClick={() => setEditingNodeId(editingNodeId === node.id ? null : node.id)}
              >
                <span className="text-xs" style={{ color: NODE_TYPE_META[node.type]?.color }}>
                  {NODE_TYPE_META[node.type]?.emoji}
                </span>
                <span className="flex-1 text-xs text-zinc-300 truncate">
                  {node.title || node.note || "未命名节点"}
                </span>
                {node.scene_id && (
                  <MapPin className="w-3 h-3 text-blue-400 flex-shrink-0" />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-red-400 transition-all cursor-pointer"
                  title="删除节点"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Inline editor */}
              {editingNodeId === node.id && editingNode && (
                <NodeEditorPanel
                  node={editingNode}
                  onClose={() => setEditingNodeId(null)}
                />
              )}
            </div>
          ))}
          {threadNodes.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-zinc-500">
              暂无节点，点击 + 添加
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主视图 ──

const THREAD_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#f59e0b",
  "#06b6d4", "#ec4899", "#84cc16", "#6366f1", "#6b7280",
];

export function ThreadListView() {
  const threads = useWritingStore((s) => s.threads);
  const createThread = useWritingStore((s) => s.createThread);
  const [filterType, setFilterType] = useState<WritingThread["type"] | "all">("all");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");

  const filtered = filterType === "all"
    ? threads
    : threads.filter((t) => t.type === filterType);

  const handleCreate = useCallback(async (type: WritingThread["type"]) => {
    try {
      const color = THREAD_COLORS[threads.length % THREAD_COLORS.length];
      await createThread(type, "", color);
    } catch (e) {
      console.error("Failed to create thread:", e);
    }
  }, [threads.length, createThread]);

  const counts = {
    all: threads.length,
    main: threads.filter((t) => t.type === "main").length,
    subplot: threads.filter((t) => t.type === "subplot").length,
    dark: threads.filter((t) => t.type === "dark").length,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 transition-colors cursor-pointer">
            <Plus className="w-3 h-3" />
            添加叙事线
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleCreate("main")}>
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              明线（主线）
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreate("subplot")}>
              <Layers className="w-3.5 h-3.5 text-green-400" />
              支线
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreate("dark")}>
              <EyeOff className="w-3.5 h-3.5 text-purple-400" />
              暗线
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filter */}
        <div className="flex items-center gap-1 ml-2">
          {([["all", "全部"], ["main", "明线"], ["subplot", "支线"], ["dark", "暗线"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                filterType === key
                  ? "bg-zinc-700 text-zinc-200 font-medium"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center rounded border border-zinc-700 overflow-hidden">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 transition-colors cursor-pointer ${viewMode === "list" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
            title="列表视图"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`p-1.5 transition-colors cursor-pointer ${viewMode === "timeline" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
            title="时间线视图"
          >
            <GitBranch className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "timeline" ? (
        <ThreadTimelineView />
      ) : (
      <div className="space-y-2">
        {filtered.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-zinc-500 text-sm">
            {threads.length === 0
              ? "暂无叙事线，点击「添加叙事线」开始规划"
              : "当前筛选条件下没有叙事线"}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
