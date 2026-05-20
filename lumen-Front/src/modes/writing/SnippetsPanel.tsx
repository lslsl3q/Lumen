import { useState, useMemo } from "react";
import { cn } from "../../lib/utils";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  Plus,
  Pin,
  PinOff,
  Trash2,
  MoreHorizontal,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import { SnippetEditor } from "./SnippetEditor";
import { SidebarToolbar } from "./SidebarToolbar";

export function SnippetsPanel() {
  const snippets = useWritingStore((s) => s.snippets);
  const activeSnippetId = useWritingStore((s) => s.activeSnippetId);
  const setActiveSnippet = useWritingStore((s) => s.setActiveSnippet);
  const createSnippetAction = useWritingStore((s) => s.createSnippetAction);
  const deleteSnippetAction = useWritingStore((s) => s.deleteSnippetAction);
  const updateSnippetAction = useWritingStore((s) => s.updateSnippetAction);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return snippets;
    const q = search.toLowerCase();
    return snippets.filter((s) => s.name.toLowerCase().includes(q));
  }, [snippets, search]);

  const handleTogglePin = async (id: string, current: number) => {
    await updateSnippetAction(id, { pinned: current ? 0 : 1 });
  };

  const activeSnippet = snippets.find((s) => s.id === activeSnippetId);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <SidebarToolbar search={search} onSearchChange={setSearch} placeholder={`搜索 ${snippets.length} 个片段…`}>
        <button
          type="button"
          onClick={() => createSnippetAction()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          新建片段
        </button>
      </SidebarToolbar>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm font-medium text-[var(--color-text-dim)] mb-1">
              {snippets.length === 0 ? "暂无片段" : "未找到匹配"}
            </p>
            <p className="text-[11px] text-[var(--color-text-dim)] leading-relaxed">
              片段是小型文本，可快速插入到场景中。
              <br />
              点击上方按钮创建新片段。
            </p>
          </div>
        ) : (
          filtered.map((snippet) => (
            <button
              key={snippet.id}
              type="button"
              onClick={() => setActiveSnippet(snippet.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-[var(--color-border)] transition-colors cursor-pointer",
                activeSnippetId === snippet.id
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              )}
            >
              <FileText className="w-4 h-4 text-[var(--color-text-dim)] flex-none" />
              <span className="flex-1 text-[13px] text-[var(--color-text-secondary)] truncate">
                {snippet.name || "Untitled"}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin(snippet.id, snippet.pinned);
                }}
                className="p-0.5 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/10 transition-colors cursor-pointer"
                title={snippet.pinned ? "Unpin" : "Pin"}
              >
                {snippet.pinned ? (
                  <Pin className="w-3 h-3" />
                ) : (
                  <PinOff className="w-3 h-3 opacity-50" />
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="p-0.5 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSnippetAction(snippet.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </button>
          ))
        )}
      </div>

      {/* Floating editor */}
      {activeSnippet && (
        <SnippetEditor
          snippet={activeSnippet}
          onClose={() => setActiveSnippet(null)}
        />
      )}
    </div>
  );
}
