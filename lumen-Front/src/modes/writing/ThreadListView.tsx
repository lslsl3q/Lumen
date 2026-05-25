import { useState, useCallback, useMemo, useRef } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown,
  Circle, Eye, EyeOff, Layers, CheckCircle2, MapPin, List, GitBranch, AlertTriangle, Sparkles,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible";
import { useWebSocket } from "../../hooks/useWebSocket";
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
  advance: { label: "推进", emoji: "●", color: "#94a3b8" },
  surface: { label: "浮现", emoji: "↑", color: "#3b82f6" },
  resolve: { label: "收束", emoji: "✓", color: "#22c55e" },
  background: { label: "背景", emoji: "■", color: "#a855f7" },
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
  const [isGoal, setIsGoal] = useState(node.goal);
  const [satIntensity, setSatIntensity] = useState(node.satisfaction?.intensity ?? 0);
  const [satType, setSatType] = useState(node.satisfaction?.type ?? "");

  const handleSave = useCallback(() => {
    const satisfaction = satIntensity > 0 ? { type: satType, intensity: satIntensity } : null;
    useWritingStore.getState().updateThreadNodeAction(node.id, {
      title: title.trim(),
      note: note.trim(),
      story_time: storyTime.trim(),
      type: nodeType,
      scene_id: sceneId,
      goal: isGoal,
      satisfaction,
    });
    onClose();
  }, [node.id, title, note, storyTime, nodeType, sceneId, isGoal, satIntensity, satType, onClose]);

  return (
    <div className="border-t border-zinc-700/60 bg-zinc-900/50 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Select
            value={nodeType}
            onValueChange={(v) => setNodeType(v as WritingThreadNode["type"])}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(NODE_TYPE_META) as [WritingThreadNode["type"], typeof NODE_TYPE_META[WritingThreadNode["type"]]][]).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="inline-flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer">
            <input type="checkbox" checked={isGoal} onChange={(e) => setIsGoal(e.target.checked)} className="accent-zinc-500" />
            目标
          </label>
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

      {/* Satisfaction / 爽点 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-600">爽点</span>
        {[1, 2, 3].map(n => (
          <button
            key={n}
            onClick={() => setSatIntensity(satIntensity === n ? 0 : n)}
            className={`text-[12px] transition-colors cursor-pointer ${satIntensity >= n ? "text-yellow-400" : "text-zinc-700"}`}
            type="button"
          >
            ★
          </button>
        ))}
        {satIntensity > 0 && (
          <Select value={satType} onValueChange={setSatType}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="类型…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="扮猪吃虎">扮猪吃虎</SelectItem>
              <SelectItem value="逆袭">逆袭</SelectItem>
              <SelectItem value="真相大白">真相大白</SelectItem>
              <SelectItem value="扬眉吐气">扬眉吐气</SelectItem>
              <SelectItem value="升级突破">升级突破</SelectItem>
            </SelectContent>
          </Select>
        )}
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
                {node.goal && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-dashed border-zinc-600">目标</span>
                )}
                {node.satisfaction && node.satisfaction.intensity > 0 && (
                  <span className="text-[10px] text-yellow-500">
                    {"★".repeat(node.satisfaction.intensity)}
                  </span>
                )}
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
  const allThreadNodes = useWritingStore((s) => s.threadNodes);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const acts = useWritingStore((s) => s.acts);
  const [filterType, setFilterType] = useState<WritingThread["type"] | "all">("all");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [pitsOpen, setPitsOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  const handleAnalyzeMessage = useCallback((event: any) => {
    if (!requestIdRef.current || event.request_id !== requestIdRef.current) return;
    if (event.type === "text" && event.content) {
      setAnalysisResult(prev => prev + event.content);
    }
    if (event.type === "done" || event.type === "error") {
      setAnalyzing(false);
      requestIdRef.current = null;
    }
  }, []);

  const { sendMessage: wsSend } = useWebSocket(handleAnalyzeMessage);

  const handleAnalyze = useCallback(() => {
    if (!activeProjectId || analyzing) return;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setAnalysisResult("");
    setAnalyzing(true);

    // Collect latest chapter content
    let chapterId = "";
    let chapterTitle = "";
    let chapterContent = "";
    for (const act of acts) {
      for (const ch of (act as any).chapters || []) {
        for (const sc of ch.scenes || []) {
          // Just pick the last chapter that has content
          const text = sc.summary || "";
          if (text || sc.content) {
            chapterId = ch.id;
            chapterTitle = ch.title || "";
          }
        }
      }
    }

    // Concatenate scene content from the latest chapter
    if (chapterId) {
      for (const act of acts) {
        for (const ch of (act as any).chapters || []) {
          if (ch.id === chapterId) {
            const parts: string[] = [];
            for (const sc of ch.scenes || []) {
              if (sc.summary) parts.push(sc.summary);
            }
            chapterContent = parts.join("\n");
          }
        }
      }
    }

    const projectName = useWritingStore.getState().activeProjectId || "";

    wsSend({
      type: "writing",
      ai_mode: "analyze_chapter",
      book_id: activeProjectId,
      chapter_id: chapterId,
      chapter_title: chapterTitle,
      chapter_content: chapterContent.slice(-6000),
      book_name: projectName,
      request_id: requestId,
    });
  }, [activeProjectId, acts, analyzing, wsSend]);

  const unfilledPits = useMemo(() => {
    const pits: { thread: WritingThread; node: WritingThreadNode }[] = [];
    for (const thread of threads) {
      const nodes = allThreadNodes[thread.id] || [];
      for (const node of nodes) {
        if (node.type !== "surface") continue;
        const hasResolve = nodes.some(n => n.type === "resolve" && n.sort_order >= node.sort_order);
        if (!hasResolve) {
          pits.push({ thread, node });
        }
      }
    }
    return pits;
  }, [threads, allThreadNodes]);

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

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={analyzing || !activeProjectId}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium border transition-colors cursor-pointer ${
            analyzing
              ? "bg-purple-500/10 border-purple-500/30 text-purple-400 animate-pulse"
              : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 hover:border-zinc-600"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title="分析当前章节"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {analyzing ? "分析中…" : "分析章节"}
        </button>
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

        {/* 章节分析结果 */}
        {(analysisResult || analyzing) && (
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/40">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[12px] font-medium text-zinc-300">章节叙事分析</span>
              {analyzing && <span className="text-[10px] text-purple-400 animate-pulse">生成中…</span>}
              <div className="flex-1" />
              <button
                onClick={() => { setAnalysisResult(""); setAnalyzing(false); }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
            <div className="px-3 py-2.5 text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {analysisResult || "等待分析结果…"}
            </div>
          </div>
        )}

        {/* 坑追踪：未填的伏笔 */}
        {unfilledPits.length > 0 && (
          <Collapsible open={pitsOpen} onOpenChange={setPitsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/40 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer">
              {pitsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
              <span className="font-medium">未填的坑</span>
              <span className="text-[11px] text-zinc-500">({unfilledPits.length})</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 space-y-0.5 pl-3">
                {unfilledPits.map(({ thread, node }) => (
                  <div key={node.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-400 hover:bg-zinc-800/40 transition-colors">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: thread.color }} />
                    <span className="text-zinc-500 shrink-0">{thread.name}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="truncate flex-1">{node.title || "未命名浮现节点"}</span>
                    {node.goal && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-dashed border-zinc-600 shrink-0">目标</span>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
      )}
    </div>
  );
}
