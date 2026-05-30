import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { useWritingStore } from "../../../stores/useWritingStore";
import { BeatCard } from "./BeatCard";
import { PLOT_LINE_TYPE_LABELS } from "../../../api/writing";

interface NodeWorkbenchProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeWorkbench({ nodeId, onClose }: NodeWorkbenchProps) {
  const plotTree = useWritingStore((s) => s.plotTree);
  const updateNodeAction = useWritingStore((s) => s.updateNodeAction);
  const createBeatAction = useWritingStore((s) => s.createBeatAction);
  const updateBeatAction = useWritingStore((s) => s.updateBeatAction);
  const deleteBeatAction = useWritingStore((s) => s.deleteBeatAction);
  const titleRef = useRef<HTMLInputElement>(null);

  // Find node and its context from plotTree
  const ctx = useMemo(() => {
    if (!plotTree?.arcs) return null;
    for (const arc of plotTree.arcs) {
      for (const line of arc.lines || []) {
        for (const node of line.nodes || []) {
          if (node.id === nodeId) {
            return { node, line, arc };
          }
        }
      }
    }
    return null;
  }, [plotTree, nodeId]);

  // Local editing state
  const [title, setTitle] = useState(() => ctx?.node.title || "");
  const [startCh, setStartCh] = useState(() => ctx?.node.start_ch ?? 1);
  const [length, setLength] = useState(() => {
    const s = ctx?.node.start_ch ?? 1;
    const e = ctx?.node.end_ch ?? s + 1;
    return e - s;
  });
  const [summary, setSummary] = useState(() => ctx?.node.summary || "");

  // Sync when node changes externally
  useEffect(() => {
    if (!ctx) return;
    setTitle(ctx.node.title || "");
    setStartCh(ctx.node.start_ch ?? 1);
    const s = ctx.node.start_ch ?? 1;
    setLength((ctx.node.end_ch ?? s + 1) - s);
    setSummary(ctx.node.summary || "");
  }, [ctx]);

  // Auto-focus title input on mount
  useEffect(() => {
    requestAnimationFrame(() => titleRef.current?.focus());
  }, []);

  // Refs for unmount flush (avoids stale closure)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestRef = useRef({ title, startCh, length, summary });
  latestRef.current = { title, startCh, length, summary };

  // Flush pending saves on unmount (only if node still exists in tree)
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // Skip flush if plotTree has been reset (project switch etc.)
        if (!plotTree?.arcs) return;
        const stillExists = plotTree.arcs.some(a =>
          (a.lines || []).some(l =>
            (l.nodes || []).some(n => n.id === nodeId)
          )
        );
        if (!stillExists) return;
        const v = latestRef.current;
        updateNodeAction(nodeId, { title: v.title, start_ch: v.startCh, end_ch: v.startCh + v.length, summary: v.summary });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed display range (left-closed, right-open: end_ch = startCh + length, display end_ch - 1)
  const endCh = startCh + length;

  // Debounced save for text fields
  const scheduleSave = useCallback((data: Parameters<typeof updateNodeAction>[1]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateNodeAction(nodeId, data), 600);
  }, [nodeId, updateNodeAction]);

  // Immediate save for numeric fields (on blur)
  const handleTitleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateNodeAction(nodeId, { title });
  }, [nodeId, title, updateNodeAction]);

  const handleSummaryBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateNodeAction(nodeId, { summary });
  }, [nodeId, summary, updateNodeAction]);

  const handleRangeBlur = useCallback(() => {
    const sc = Math.max(1, startCh);
    const len = Math.max(1, length);
    setStartCh(sc);
    setLength(len);
    updateNodeAction(nodeId, { start_ch: sc, end_ch: sc + len });
  }, [nodeId, startCh, length, updateNodeAction]);

  if (!ctx) return null;

  const { node, line, arc } = ctx;
  const beats = node.beats || [];
  const lineTypeLabel = PLOT_LINE_TYPE_LABELS[line.type as keyof typeof PLOT_LINE_TYPE_LABELS] || line.type;

  return (
    <div
      className="nr-workbench"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="nr-wb-header">
        <input
          ref={titleRef}
          className="nr-wb-title"
          type="text"
          value={title}
          placeholder="节点标题..."
          onChange={(e) => { setTitle(e.target.value); scheduleSave({ title: e.target.value }); }}
          onBlur={handleTitleBlur}
        />
        <button className="nr-wb-close" onClick={onClose} title="关闭">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Breadcrumb: Arc > Line */}
      <div className="nr-wb-row" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#71717a' }}>
          {arc.title || "Arc"}
          <span style={{ margin: '0 4px', opacity: 0.4 }}>/</span>
          {line.title || line.name || "未命名"}
          <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.5 }}>({lineTypeLabel})</span>
        </span>
      </div>

      {/* Range row */}
      <div className="nr-wb-row">
        <label className="nr-wb-field">
          <span className="nr-wb-label">起始章</span>
          <input
            className="nr-wb-num"
            type="number"
            min={1}
            value={startCh}
            onChange={(e) => setStartCh(Number(e.target.value) || 1)}
            onBlur={handleRangeBlur}
          />
        </label>
        <label className="nr-wb-field">
          <span className="nr-wb-label">章节长度</span>
          <input
            className="nr-wb-num"
            type="number"
            min={1}
            value={length}
            onChange={(e) => setLength(Number(e.target.value) || 1)}
            onBlur={handleRangeBlur}
          />
        </label>
        <span className="nr-wb-range-display">
          ch {startCh} ~ {endCh - 1}
        </span>
      </div>

      {/* Summary */}
      <div className="nr-wb-section">
        <textarea
          className="nr-wb-summary"
          value={summary}
          placeholder="摘要..."
          rows={3}
          onChange={(e) => { setSummary(e.target.value); scheduleSave({ summary: e.target.value }); }}
          onBlur={handleSummaryBlur}
        />
      </div>

      {/* Beats */}
      <div className="nr-wb-section">
        <div className="nr-wb-section-header">
          <span className="nr-wb-section-title">Beats ({beats.length})</span>
          <button
            className="nr-wb-add-btn"
            onClick={() => createBeatAction(nodeId)}
          >
            <Plus className="w-3.5 h-3.5" /> 添加 Beat
          </button>
        </div>
        <div className="nr-wb-beats">
          {beats.length === 0 && (
            <p className="nr-wb-empty">暂无 Beat，点击「添加 Beat」创建</p>
          )}
          {beats.map((beat) => (
            <BeatCard
              key={beat.id}
              beat={beat}
              onUpdate={updateBeatAction}
              onDelete={deleteBeatAction}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
