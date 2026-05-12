/**
 * ChapterSidebar — 左栏：作品列表 + 章节管理 + 世界观入口
 */
import { useEffect, useState } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { getExportUrl } from "../../api/writing";
import { Plus, Trash2, BookOpen, FileText, Settings, ChevronRight, ChevronDown, Download } from "lucide-react";

export function ChapterSidebar() {
  const {
    projects, activeProjectId, chapters, activeChapterId, isLoaded,
    loadProjects, createProject, deleteProject, setActiveProject,
    createChapter, renameChapter, deleteChapter, reorderChapters, setActiveChapter,
  } = useWritingStore();

  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const handleProjectClick = (id: string) => {
    setActiveProject(id);
    setExpandedProject(expandedProject === id ? null : id);
  };

  return (
    <div className="flex flex-col h-full w-full bg-surface-deep border-r border-border-default select-none">
      {/* 顶部：作品列表 */}
      <div className="p-3 border-b border-border-default">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
            <BookOpen className="inline w-3.5 h-3.5 mr-1" />
            作品
          </span>
          <button
            onClick={async () => {
              try {
                setError(null);
                const p = await createProject("新作品");
                setExpandedProject(p.id);
                setEditingProjectId(p.id);
                setEditProjectName("新作品");
              } catch (e: any) {
                setError(e?.message ?? "创建失败");
              }
            }}
            className="p-1 rounded hover:bg-surface-elevated text-text-muted hover:text-text-primary cursor-pointer transition-colors"
            title="新建作品"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {error && (
          <p className="text-[11px] text-red-400 mb-1">{error}</p>
        )}
        {projects.length === 0 && !error && (
          <p className="text-[11px] text-text-muted italic py-2">
            {isLoaded ? "暂无作品，点击 + 创建" : "加载中…"}
          </p>
        )}

        <div className="space-y-0.5 max-h-[180px] overflow-y-auto scrollbar-lumen">
          {projects.map((p) => {
            const isExpanded = expandedProject === p.id;
            const isActive = p.id === activeProjectId;
            return (
              <div
                key={p.id}
                onClick={() => handleProjectClick(p.id)}
                className={`flex items-center gap-1.5 px-2 py-2 rounded-md text-[13px] cursor-pointer group transition-colors
                  ${isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                  }`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 flex-shrink-0 text-text-muted" />
                ) : (
                  <ChevronRight className="w-3 h-3 flex-shrink-0 text-text-muted" />
                )}
                {editingProjectId === p.id ? (
                  <input
                    autoFocus
                    value={editProjectName}
                    onChange={(e) => setEditProjectName(e.target.value)}
                    onKeyDown={async (e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const name = editProjectName.trim();
                        if (name) {
                          try { await useWritingStore.getState().updateProject(p.id, { name }); } catch {}
                        }
                        setEditingProjectId(null);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingProjectId(null);
                      }
                    }}
                    onBlur={() => setEditingProjectId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-surface-elevated border border-primary/30 rounded px-2 py-0 text-[13px] text-text-primary outline-none"
                  />
                ) : (
                  <span className="truncate flex-1">{p.name}</span>
                )}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`删除「${p.name}」及其所有章节和设定？`)) return;
                    try { setError(null); await deleteProject(p.id); }
                    catch (e: any) { setError(e?.message ?? "删除失败"); }
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 cursor-pointer transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 中部：章节列表 */}
      {activeProject && (
        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
              <FileText className="inline w-3.5 h-3.5 mr-1" />
              章节
            </span>
            <button
              onClick={async () => {
                try { setError(null); await createChapter("新章节"); }
                catch (e: any) { setError(e?.message ?? "创建失败"); }
              }}
              className="p-1 rounded hover:bg-surface-elevated text-text-muted hover:text-text-primary cursor-pointer transition-colors"
              title="新建章节"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-red-400 px-3 mb-1">{error}</p>
          )}

          {chapters.length === 0 && (
            <p className="text-[11px] text-text-muted italic px-5 py-3">点击 + 创建第一章</p>
          )}

          <div className="px-2 space-y-0.5">
            {chapters.map((ch, idx) => (
              <div
                key={ch.id}
                draggable
                onClick={() => setActiveChapter(ch.id)}
                onDoubleClick={() => {
                  setEditingChapterId(ch.id);
                  setEditTitle(ch.title);
                }}
                onDragStart={() => setDragId(ch.id)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => {
                  if (!dragId || dragId === ch.id) return;
                  const ordered = chapters.map((c) => c.id);
                  const fromIdx = ordered.indexOf(dragId);
                  const toIdx = ordered.indexOf(ch.id);
                  if (fromIdx !== -1 && toIdx !== -1) {
                    ordered.splice(fromIdx, 1);
                    ordered.splice(toIdx, 0, dragId);
                    reorderChapters(ordered);
                  }
                  setDragId(null);
                }}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer group transition-colors
                  ${ch.id === activeChapterId
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                  }
                  ${dragId === ch.id ? "opacity-50" : ""}
                `}
              >
                {editingChapterId === ch.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={async (e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const title = editTitle.trim();
                        try { if (title) await renameChapter(ch.id, title); } catch {}
                        setEditingChapterId(null);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingChapterId(null);
                      }
                    }}
                    onBlur={() => setEditingChapterId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-surface-elevated border border-primary/30 rounded px-2 py-0 text-[13px] text-text-primary outline-none"
                  />
                ) : (
                  <span className="truncate flex-1">
                    <span className="text-text-muted mr-1.5 text-[11px]">{idx + 1}.</span>
                    {ch.title}
                  </span>
                )}
                <span className="text-[10px] text-text-muted mr-1 flex-shrink-0">{ch.word_count ?? 0}字</span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("删除此章节？")) return;
                    try { setError(null); await deleteChapter(ch.id); }
                    catch (e: any) { setError(e?.message ?? "删除失败"); }
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 cursor-pointer transition-opacity flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部：导出 + 世界观入口 */}
      {activeProject && (
        <div className="p-2 border-t border-border-default flex-shrink-0 space-y-0.5">
          {/* 导出 */}
          <div className="flex gap-1">
            <a
              href={getExportUrl(activeProjectId!, "txt")}
              download
              className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md text-[13px] text-text-muted hover:text-text-primary hover:bg-surface-elevated cursor-pointer transition-colors no-underline"
            >
              <Download className="w-3.5 h-3.5" />
              TXT
            </a>
            <a
              href={getExportUrl(activeProjectId!, "md")}
              download
              className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md text-[13px] text-text-muted hover:text-text-primary hover:bg-surface-elevated cursor-pointer transition-colors no-underline"
            >
              <Download className="w-3.5 h-3.5" />
              MD
            </a>
          </div>
          {/* 世界观设定 */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[13px] text-text-muted hover:text-text-primary hover:bg-surface-elevated cursor-pointer transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            世界观设定
            {showSettings ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
          </button>
          {showSettings && <SettingsList />}
        </div>
      )}
    </div>
  );
}

/* ── 世界观设定列表 ── */

const CATEGORY_LABELS: Record<string, string> = {
  character: "角色", location: "地点", world: "世界",
  object: "物品", plot: "剧情", rules: "规则", custom: "自定义",
};

const CATEGORY_OPTIONS = [
  { value: "character", label: "角色" },
  { value: "location", label: "地点" },
  { value: "world", label: "世界" },
  { value: "object", label: "物品" },
  { value: "plot", label: "剧情" },
  { value: "rules", label: "规则" },
  { value: "custom", label: "自定义" },
];

function SettingsList() {
  const { settings, activeProjectId, loadSettings, createSetting, updateSetting, deleteSetting } = useWritingStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingSettingId, setPendingSettingId] = useState<string | null>(null);
  const [pendingSettingName, setPendingSettingName] = useState("");

  useEffect(() => {
    if (activeProjectId) loadSettings(activeProjectId);
  }, [activeProjectId]);

  const handleUpdateContent = async (id: string, content: string) => {
    try {
      await updateSetting(id, { content: { text: content } } as any);
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-1 px-1 space-y-0.5 max-h-[300px] overflow-y-auto scrollbar-lumen">
      {settings.length === 0 && (
        <p className="text-[10px] text-text-muted italic px-3 py-1">暂无设定</p>
      )}
      {settings.map((s) => {
        const isExpanded = expandedId === s.id;
        const contentText = (s.content as any)?.text ?? "";
        return (
          <div key={s.id} className="rounded-md overflow-hidden">
            <div
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
              className="flex items-center justify-between px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-elevated group transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5 truncate flex-1">
                <span className="text-[10px] text-text-muted">{CATEGORY_LABELS[s.category] ?? s.category}</span>
                {pendingSettingId === s.id ? (
                  <input
                    autoFocus
                    value={pendingSettingName}
                    onChange={(e) => setPendingSettingName(e.target.value)}
                    onKeyDown={async (e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const name = pendingSettingName.trim();
                        if (name) { try { await updateSetting(s.id, { name }); } catch {} }
                        setPendingSettingId(null);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setPendingSettingId(null);
                      }
                    }}
                    onBlur={() => setPendingSettingId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-surface-elevated border border-primary/30 rounded px-2 py-0 text-[12px] text-text-primary outline-none min-w-0"
                  />
                ) : (
                  <span>{s.name}</span>
                )}
              </span>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try { await deleteSetting(s.id); }
                  catch { /* ignore */ }
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 cursor-pointer transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
            {isExpanded && (
              <div className="px-3 pb-2 space-y-1.5">
                <input
                  value={s.name}
                  onChange={async (e) => {
                    try { await updateSetting(s.id, { name: e.target.value }); }
                    catch { /* ignore */ }
                  }}
                  className="w-full bg-surface-elevated border border-border-default rounded px-2 py-1 text-[12px] text-text-primary outline-none focus:border-primary/30"
                  placeholder="设定名称"
                />
                <select
                  value={s.category}
                  onChange={async (e) => {
                    try { await updateSetting(s.id, { category: e.target.value }); await loadSettings(activeProjectId!); }
                    catch { /* ignore */ }
                  }}
                  className="w-full bg-surface-elevated border border-border-default rounded px-2 py-1 text-[11px] text-text-secondary outline-none focus:border-primary/30"
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  defaultValue={contentText}
                  onBlur={(e) => handleUpdateContent(s.id, e.target.value)}
                  placeholder="描述内容…"
                  rows={4}
                  className="w-full bg-surface-elevated border border-border-default rounded px-2 py-1.5 text-[12px] text-text-primary placeholder-[var(--color-text-dim)] outline-none focus:border-primary/30 resize-y leading-relaxed"
                />
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={async () => {
          if (!activeProjectId) return;
          try {
            const ns = await createSetting("新设定");
            setPendingSettingId(ns.id);
            setPendingSettingName("新设定");
          } catch {}
        }}
        className="flex items-center gap-1 w-full px-3 py-1.5 rounded-md text-[11px] text-text-muted hover:text-text-secondary hover:bg-surface-elevated cursor-pointer transition-colors"
      >
        <Plus className="w-3 h-3" /> 新建设定
      </button>
    </div>
  );
}
