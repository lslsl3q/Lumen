import { useState, useMemo, useEffect, useCallback } from "react";
import { useWritingStore } from "../../../stores/useWritingStore";
import { NarrativeRuler, arcChapterRange } from "./NarrativeRuler";
import { NodeWorkbench } from "./NodeWorkbench";
import { NodeContextMenu } from "./NodeContextMenu";
import { AddNodeMenu } from "./AddNodeMenu";
import { Plus } from "lucide-react";
import type { PlotLineType, Plot, PlotNode, PlotLine, PlotArc } from "../../../api/writing";
import { extractDocText } from "../../../lib/tiptap";


// ── Helpers ──

interface NodeInfo {
  node: PlotNode;
  line: PlotLine;
  arc: PlotArc;
}

function buildNodeIndex(plotTree: Plot | null): Map<string, NodeInfo> {
  const map = new Map<string, NodeInfo>();
  if (!plotTree?.arcs) return map;
  for (const arc of plotTree.arcs) {
    for (const line of arc.lines || []) {
      for (const node of line.nodes || []) {
        map.set(node.id, { node, line, arc });
      }
    }
  }
  return map;
}


export function PlotPanel() {
  const plotTree = useWritingStore((s) => s.plotTree);
  const nodeIndex = useMemo(() => buildNodeIndex(plotTree), [plotTree]);
  const createArc = useWritingStore((s) => s.createArcAction);
  const createLineAction = useWritingStore((s) => s.createLineAction);
  const createNodeAction = useWritingStore((s) => s.createNodeAction);
  const updateNodeAction = useWritingStore((s) => s.updateNodeAction);
  const deleteNodeAction = useWritingStore((s) => s.deleteNodeAction);
  const activeProject = useWritingStore((s) => {
    const proj = s.projects.find(p => p.id === s.activeProjectId);
    return proj || null;
  });
  const acts = useWritingStore((s) => s.acts);

  // Whole-book total chapters — purely from plot data (planning scope)
  const totalChapters = useMemo(() => {
    if (plotTree?.arcs) {
      let maxCh = 0;
      for (const arc of plotTree.arcs) {
        const { end } = arcChapterRange(arc);
        if (end > maxCh) maxCh = end;
      }
      if (maxCh > 0) return maxCh;
    }
    return 20;
  }, [plotTree]);

  // Shared zoom state
  const [viewRange, setViewRange] = useState<[number, number]>(() => [1, totalChapters]);
  useEffect(() => { setViewRange([1, totalChapters]); }, [totalChapters]);

  // ── Playhead state ──
  const [playheadChapter, setPlayheadChapter] = useState(1);

  // ── Manuscript progress (auto + manual override) ──
  const autoProgress = useMemo(() => {
    let maxCh = 0;
    for (const act of acts) {
      for (const ch of act.chapters || []) {
        const hasContent = (ch.scenes || []).some((sc: any) => {
          const c = sc?.content;
          if (!c) return false;
          if (typeof c === "object") {
            const texts: string[] = [];
            const walk = (n: any) => { if (n.text) texts.push(n.text); if (n.content) n.content.forEach(walk); };
            if (c.content) c.content.forEach(walk);
            return texts.join("").trim().length > 0;
          }
          if (typeof c === "string") {
            return extractDocText(c).trim().length > 0;
          }
          return false;
        });
        if (hasContent) {
          const chNum = ch.numerate;
          if (chNum > maxCh) maxCh = chNum;
        }
      }
    }
    return maxCh > 0 ? maxCh : 1;
  }, [acts]);

  const [manualProgress, setManualProgress] = useState<number | null>(null);
  const currentChapter = Math.max(autoProgress, manualProgress ?? 0);

  const handleProgressChange = useCallback((ch: number | null) => {
    setManualProgress(ch);
  }, []);

  // Workbench state
  const [workbenchNodeId, setWorkbenchNodeId] = useState<string | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ nodeId: string; x: number; y: number; lineType: PlotLineType } | null>(null);

  const getNodeLineType = useCallback((nodeId: string): PlotLineType => {
    const info = nodeIndex.get(nodeId);
    return (info?.line.type as PlotLineType) || "main";
  }, [nodeIndex]);

  const handleDoubleClickNode = useCallback((nodeId: string) => {
    setWorkbenchNodeId(nodeId);
  }, []);

  const handleContextMenuNode = useCallback((nodeId: string, e: React.MouseEvent) => {
    setCtxMenu({ nodeId, x: e.clientX, y: e.clientY, lineType: getNodeLineType(nodeId) });
  }, [getNodeLineType]);

  // ── Ripple shift helper (batched parallel) ──
  const rippleShiftInLine = useCallback(async (
    lineId: string, excludeNodeId: string, pivotCh: number, delta: number
  ) => {
    if (!plotTree?.arcs) return;
    const updates: Promise<void>[] = [];
    for (const arc of plotTree.arcs) {
      for (const line of arc.lines || []) {
        if (line.id !== lineId) continue;
        for (const n of line.nodes || []) {
          if (n.id === excludeNodeId) continue;
          const sc = n.start_ch || 1;
          if (sc >= pivotCh) {
            const ec = n.end_ch || (sc + 1);
            updates.push(updateNodeAction(n.id, { start_ch: sc + delta, end_ch: ec + delta }));
          }
        }
      }
    }
    await Promise.all(updates);
  }, [plotTree, updateNodeAction]);

  // ── Delete handlers ──
  const handleDeleteNode = useCallback(async () => {
    if (!ctxMenu) return;
    await deleteNodeAction(ctxMenu.nodeId);
    if (workbenchNodeId === ctxMenu.nodeId) setWorkbenchNodeId(null);
  }, [ctxMenu, deleteNodeAction, workbenchNodeId]);

  const handleRippleDeleteNode = useCallback(async () => {
    if (!ctxMenu) return;
    const info = nodeIndex.get(ctxMenu.nodeId);
    if (!info) return;
    const sc = info.node.start_ch || 1;
    const len = (info.node.end_ch || (sc + 1)) - sc;
    await deleteNodeAction(ctxMenu.nodeId);
    if (workbenchNodeId === ctxMenu.nodeId) setWorkbenchNodeId(null);
    rippleShiftInLine(info.line.id, ctxMenu.nodeId, sc + len, -len);
  }, [ctxMenu, deleteNodeAction, workbenchNodeId, nodeIndex, rippleShiftInLine]);

  // RESERVED: 线型切换 — 需实现 switchNodeLineType action
  const handleChangeType = useCallback((_type: PlotLineType) => {
  }, []);

  // RESERVED: 节点复制 — 需实现 copyNode action
  const handleCopyNode = useCallback(() => {
  }, []);

  // ── Insert helpers ──
  const doInsert = useCallback(async (
    lineId: string, startCh: number, ripple: boolean, pivotCh: number
  ) => {
    const node = await createNodeAction(lineId, "", "", "", startCh, startCh + 1);
    if (node) {
      if (ripple) rippleShiftInLine(lineId, node.id, pivotCh, 1);
      setPlayheadChapter(startCh + 1);
      setWorkbenchNodeId(node.id);
    }
    setCtxMenu(null);
  }, [createNodeAction, rippleShiftInLine]);

  // ── Context menu: smart insert ──
  const handleInsertBeforeRipple = useCallback(() => {
    if (!ctxMenu) return;
    const info = nodeIndex.get(ctxMenu.nodeId);
    if (!info) return;
    const ch = info.node.start_ch || 1;
    doInsert(info.line.id, ch, true, ch);
  }, [ctxMenu, nodeIndex, doInsert]);

  const handleInsertBeforeStay = useCallback(() => {
    if (!ctxMenu) return;
    const info = nodeIndex.get(ctxMenu.nodeId);
    if (!info) return;
    const ch = info.node.start_ch || 1;
    doInsert(info.line.id, ch, false, ch);
  }, [ctxMenu, nodeIndex, doInsert]);

  const handleInsertAfterRipple = useCallback(() => {
    if (!ctxMenu) return;
    const info = nodeIndex.get(ctxMenu.nodeId);
    if (!info) return;
    const endCh = info.node.end_ch || ((info.node.start_ch || 1) + 1);
    doInsert(info.line.id, endCh, true, endCh);
  }, [ctxMenu, nodeIndex, doInsert]);

  const handleInsertAfterStay = useCallback(() => {
    if (!ctxMenu) return;
    const info = nodeIndex.get(ctxMenu.nodeId);
    if (!info) return;
    const endCh = info.node.end_ch || ((info.node.start_ch || 1) + 1);
    doInsert(info.line.id, endCh, false, endCh);
  }, [ctxMenu, nodeIndex, doInsert]);

  // ── Context menu: compute hasGapBefore / hasNodeAfter ──
  const ctxMenuMeta = useMemo(() => {
    if (!ctxMenu) return { hasGapBefore: false, hasNodeAfter: false };
    const info = nodeIndex.get(ctxMenu.nodeId);
    if (!info) return { hasGapBefore: false, hasNodeAfter: false };
    const sc = info.node.start_ch || 1;
    const ec = info.node.end_ch || (sc + 1);
    const siblings = info.line.nodes || [];
    // Gap before: if start_ch > 1 and no sibling node ends at sc - 1 or sc
    const hasGapBefore = sc > 1 && !siblings.some(n =>
      n.id !== ctxMenu.nodeId && ((n.end_ch || ((n.start_ch || 1) + 1)) >= sc)
    );
    // Node after: any sibling starts at or before endCh (would overlap)
    const hasNodeAfter = siblings.some(n =>
      n.id !== ctxMenu.nodeId && (n.start_ch || 1) < ec + 1
    );
    return { hasGapBefore, hasNodeAfter };
  }, [ctxMenu, nodeIndex]);

  // ── Toolbar "+" button: visual tracks for AddNodeMenu ──
  // Group lines by visual track (same as NarrativeRuler display):
  //   main → one "主线" track
  //   subplot → one "支线" track
  //   dark → grouped by line.name || line.id
  const visualTracks = useMemo(() => {
    if (!plotTree?.arcs) return [];
    const trackMap = new Map<string, {
      key: string; label: string; type: PlotLineType;
      color: string; allNodes: PlotNode[];
    }>();

    for (const arc of plotTree.arcs) {
      for (const line of arc.lines || []) {
        const lt = line.type as PlotLineType;
        if (lt === "dark") {
          const groupKey = line.name || line.id;
          const existing = trackMap.get(groupKey);
          if (existing) {
            existing.allNodes.push(...(line.nodes || []));
          } else {
            trackMap.set(groupKey, {
              key: groupKey,
              label: line.name || line.title || "暗线",
              type: "dark",
              color: line.color || "#7b6ba0",
              allNodes: [...(line.nodes || [])],
            });
          }
        } else if (lt === "subplot") {
          const existing = trackMap.get("__subplot__");
          if (existing) {
            existing.allNodes.push(...(line.nodes || []));
          } else {
            trackMap.set("__subplot__", {
              key: "__subplot__",
              label: "支线",
              type: "subplot",
              color: line.color || "#6b9e78",
              allNodes: [...(line.nodes || [])],
            });
          }
        } else {
          const existing = trackMap.get("__main__");
          if (existing) {
            existing.allNodes.push(...(line.nodes || []));
          } else {
            trackMap.set("__main__", {
              key: "__main__",
              label: "主线",
              type: "main",
              color: line.color || "#D4A84B",
              allNodes: [...(line.nodes || [])],
            });
          }
        }
      }
    }

    // Order: main first, subplot second, dark lines last
    const result = [
      trackMap.get("__main__"),
      trackMap.get("__subplot__"),
      ...[...trackMap.entries()]
        .filter(([k]) => k !== "__main__" && k !== "__subplot__")
        .map(([, v]) => v),
    ].filter(Boolean) as typeof trackMap extends Map<any, infer V> ? V[] : never;
    return result;
  }, [plotTree]);

  // Resolve a visual track key + start chapter → actual lineId for node creation
  const resolveLineIdForTrack = useCallback((trackKey: string, startCh: number): string | null => {
    if (!plotTree?.arcs) return null;
    for (const arc of plotTree.arcs) {
      const { start, end } = arcChapterRange(arc);
      if (startCh < start || startCh > end + 50) continue; // loose match
      for (const line of arc.lines || []) {
        if (trackKey === "__main__" && line.type === "main") return line.id;
        if (trackKey === "__subplot__" && line.type === "subplot") return line.id;
        if (line.type === "dark") {
          const groupKey = line.name || line.id;
          if (groupKey === trackKey) return line.id;
        }
      }
    }
    // Fallback: first matching line regardless of arc
    for (const arc of plotTree.arcs) {
      for (const line of arc.lines || []) {
        if (trackKey === "__main__" && line.type === "main") return line.id;
        if (trackKey === "__subplot__" && line.type === "subplot") return line.id;
        if (line.type === "dark" && (line.name || line.id) === trackKey) return line.id;
      }
    }
    return null;
  }, [plotTree]);

  const handleAddNodeCreate = useCallback(async (trackKey: string, startCh: number, length: number) => {
    const lineId = resolveLineIdForTrack(trackKey, startCh);
    if (!lineId) return;
    const node = await createNodeAction(lineId, "", "", "", startCh, startCh + length);
    if (node) setWorkbenchNodeId(node.id);
  }, [resolveLineIdForTrack, createNodeAction]);

  // ── Create Arc with auto-create main line ──
  const handleCreateArc = useCallback(async () => {
    const arc = await createArc("新阶段");
    if (arc) {
      await createLineAction(arc.id, "", "主线", "main", "#D4A84B");
    }
  }, [createArc, createLineAction]);

  if (!plotTree) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        选择一个项目以查看剧情结构
      </div>
    );
  }

  const arcs = plotTree.arcs || [];

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-deep)]">
      {/* Overview */}
      <div className="flex-none border-b border-zinc-700/50">
        {arcs.length === 0 ? (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-semibold text-zinc-200">
                {activeProject?.name || plotTree.title || "剧情编排"}
              </h2>
              <button
                onClick={handleCreateArc}
                className="flex items-center gap-1 text-[12px] text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 px-2.5 py-1 rounded"
              >
                <Plus className="w-3.5 h-3.5" /> 新阶段
              </button>
            </div>
            <p className="text-zinc-600 text-[12px]">点击「新阶段」开始规划剧情结构</p>
          </div>
        ) : (
          <NarrativeRuler
            arcs={arcs}
            totalChapters={totalChapters}
            currentChapter={currentChapter}
            onProgressChange={handleProgressChange}
            plotTitle={plotTree.title || activeProject?.name}
            compact={true}
            showDarkLines={false}
            acts={acts}
            viewRange={viewRange}
            onViewRangeChange={setViewRange}
            playhead={playheadChapter}
            onPlayheadChange={setPlayheadChapter}
          />
        )}
      </div>

      {/* Main timeline */}
      <div className="flex-initial overflow-y-auto min-h-0 mb-4">
        {arcs.length > 0 ? (
          <div className="px-6 pt-3 pb-6">
            <NarrativeRuler
              arcs={arcs}
              totalChapters={totalChapters}
              currentChapter={currentChapter}
              compact={false}
              showDarkLines={true}
              viewRange={viewRange}
              onViewRangeChange={setViewRange}
              onDoubleClickNode={handleDoubleClickNode}
              onContextMenuNode={handleContextMenuNode}
              playhead={playheadChapter}
              onPlayheadChange={setPlayheadChapter}
              addNodeSlot={
                visualTracks.length > 0 ? (
                  <AddNodeMenu
                    tracks={visualTracks}
                    defaultStartCh={playheadChapter}
                    totalChapters={totalChapters}
                    onCreate={handleAddNodeCreate}
                  />
                ) : undefined
              }
            />
          </div>
        ) : null}
      </div>

      {/* Workbench area */}
      {workbenchNodeId && (
        <div className="flex-none border-t border-zinc-700/50 pt-2 max-h-[50vh] overflow-y-auto">
          <NodeWorkbench
            nodeId={workbenchNodeId}
            onClose={() => setWorkbenchNodeId(null)}
          />
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <NodeContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          lineType={ctxMenu.lineType}
          hasGapBefore={ctxMenuMeta.hasGapBefore}
          hasNodeAfter={ctxMenuMeta.hasNodeAfter}
          onEdit={() => { setWorkbenchNodeId(ctxMenu.nodeId); setCtxMenu(null); }}
          onChangeType={handleChangeType}
          onCopy={handleCopyNode}
          onDelete={handleDeleteNode}
          onRippleDelete={handleRippleDeleteNode}
          onInsertBeforeRipple={handleInsertBeforeRipple}
          onInsertBeforeStay={handleInsertBeforeStay}
          onInsertAfterRipple={handleInsertAfterRipple}
          onInsertAfterStay={handleInsertAfterStay}
          onClose={() => setCtxMenu(null)}
        />
      )}

    </div>
  );
}
