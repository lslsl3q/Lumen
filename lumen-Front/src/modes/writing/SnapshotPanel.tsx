/**
 * SnapshotPanel — 快照管理面板（模态弹窗）
 */
import { useState, useEffect } from "react";
import { Clock, Star, Shield, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingSnapshot } from "../../api/writing";

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  auto: { label: "自动", color: "text-slate-400", icon: Clock },
  manual: { label: "手动", color: "text-primary", icon: Star },
  pre_restore: { label: "备份", color: "text-amber-400", icon: Shield },
};

export function SnapshotPanel({ onClose }: { onClose: () => void }) {
  const snapshots = useWritingStore((s) => s.snapshots);
  const createManualSnapshot = useWritingStore((s) => s.createManualSnapshot);
  const restoreFromSnapshot = useWritingStore((s) => s.restoreFromSnapshot);
  const deleteSnapshotAction = useWritingStore((s) => s.deleteSnapshotAction);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const loadSnapshots = useWritingStore((s) => s.loadSnapshots);

  const [newLabel, setNewLabel] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (activeProjectId) loadSnapshots(activeProjectId);
  }, [activeProjectId, loadSnapshots]);

  const handleCreate = async () => {
    if (!activeProjectId) return;
    await createManualSnapshot(newLabel || "手动快照");
    setNewLabel("");
    setShowCreate(false);
  };

  const handleRestore = async (snap: WritingSnapshot) => {
    if (!confirm(`确认恢复到 "${snap.label || snap.type}"？\n恢复前会自动备份当前状态。`)) return;
    await restoreFromSnapshot(snap.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此快照？")) return;
    await deleteSnapshotAction(id);
  };

  const formatSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-panel border border-border-default rounded-xl w-[480px] max-h-[70vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <span className="text-sm font-medium text-slate-200">快照管理</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              创建快照
            </button>
            <button onClick={onClose} className="p-1 rounded text-slate-600 hover:text-slate-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 创建输入框 */}
        {showCreate && (
          <div className="px-5 py-3 border-b border-border-default flex gap-2">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
              placeholder="快照标签（可选）"
              className="flex-1 bg-surface-elevated border border-border-default rounded px-3 py-1.5 text-[12px] text-text-primary outline-none focus:border-primary/30"
            />
            <button onClick={handleCreate} className="px-3 py-1.5 rounded text-[12px] bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
              确认
            </button>
          </div>
        )}

        {/* 快照列表 */}
        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          {snapshots.length === 0 && (
            <div className="px-5 py-8 text-center text-text-muted text-[12px]">暂无快照</div>
          )}
          {snapshots.map((snap) => {
            const cfg = TYPE_CONFIG[snap.type] || TYPE_CONFIG.auto;
            const Icon = cfg.icon;
            return (
              <div key={snap.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-elevated/50 transition-colors border-b border-border-default/50 last:border-0">
                <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.color} bg-surface-elevated`}>{cfg.label}</span>
                    <span className="text-[12px] text-slate-300 truncate">{snap.label}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {new Date(snap.created_at * 1000).toLocaleString()} · {formatSize(snap.size_bytes)}
                    {snap.stats && ` · ${snap.stats.chapter_count} 章 · ${snap.stats.total_words} 字`}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleRestore(snap)} title="恢复" className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-400/10 cursor-pointer">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(snap.id)} title="删除" className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-400/10 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
