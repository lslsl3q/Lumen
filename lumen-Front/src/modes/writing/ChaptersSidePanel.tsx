/**
 * ChaptersSidePanel — 章节侧栏（贴边挤压式）
 */
import { useEffect, useState } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { Plus, Trash2, X, FileText } from "lucide-react";

export function ChaptersSidePanel({ onClose }: { onClose: () => void }) {
  const {
    projects, activeProjectId, chapters, activeChapterId,
    loadProjects,
    createChapter, renameChapter, deleteChapter, reorderChapters, setActiveChapter,
  } = useWritingStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => { loadProjects(); }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="absolute left-0 top-0 bottom-0 w-[260px] z-20 bg-[var(--color-bg-panel)] border-r border-[var(--color-border)] flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <span className="text-[12px] font-medium text-slate-300">章节列表</span>
        <button onClick={onClose} className="p-1 rounded text-slate-600 hover:text-slate-400 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen p-3 space-y-3">
        {activeProject && (
          <div className="px-2.5 py-1.5 rounded-md bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
            <p className="text-[11px] text-[var(--color-primary)]/70 truncate">
              <FileText className="inline w-3 h-3 mr-1 -mt-0.5" />
              {activeProject.name}
            </p>
          </div>
        )}

        {!activeProject && (
          <p className="text-[11px] text-slate-600 italic px-2">
            请先在「作品管理」中创建或选择作品
          </p>
        )}

        {activeProject && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-600">章节</span>
              <button
                onClick={() => createChapter("新章节")}
                className="p-0.5 rounded text-slate-600 hover:text-slate-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {chapters.length === 0 && (
                <p className="text-[11px] text-slate-600 italic px-1 py-2">点击 + 创建第一章</p>
              )}
              {chapters.map((ch, idx) => (
                <div
                  key={ch.id}
                  draggable
                  onClick={() => setActiveChapter(ch.id)}
                  onDoubleClick={() => { setEditingId(ch.id); setEditTitle(ch.title); }}
                  onDragStart={() => setDragId(ch.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragId || dragId === ch.id) return;
                    const ordered = chapters.map((c) => c.id);
                    const from = ordered.indexOf(dragId);
                    const to = ordered.indexOf(ch.id);
                    if (from !== -1 && to !== -1) {
                      ordered.splice(from, 1);
                      ordered.splice(to, 0, dragId);
                      reorderChapters(ordered);
                    }
                    setDragId(null);
                  }}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] cursor-pointer group transition-colors
                    ${ch.id === activeChapterId ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "text-slate-400 hover:bg-[var(--color-bg-elevated)]"}
                    ${dragId === ch.id ? "opacity-50" : ""}`}
                >
                  {editingId === ch.id ? (
                    <input
                      autoFocus value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && editTitle.trim()) {
                          await renameChapter(ch.id, editTitle.trim());
                          setEditingId(null);
                        } else if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => setEditingId(null)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-[var(--color-bg-elevated)] border border-[var(--color-primary)]/30 rounded px-2 py-0 text-[13px] text-slate-200 outline-none"
                    />
                  ) : (
                    <span className="truncate flex-1">
                      <span className="text-slate-600 mr-1 text-[11px]">{idx + 1}.</span>
                      {ch.title}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600 mr-1">{ch.word_count ?? 0}字</span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("删除此章节？")) return;
                      await deleteChapter(ch.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
