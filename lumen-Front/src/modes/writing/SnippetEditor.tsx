import { useState, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingSnippet } from "../../api/writing";
import {
  Pin,
  PinOff,
  Trash2,
  Copy,
  MoreHorizontal,
  X,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";

function parseDisplayContent(raw: string): string {
  try {
    const json = JSON.parse(raw);
    if (json._migrated_html && json.html) return json.html;
    if (json.type === "doc") return extractText(json);
  } catch {}
  return raw || "";
}

export function SnippetEditor({
  snippet,
  onClose,
}: {
  snippet: WritingSnippet;
  onClose: () => void;
}) {
  const updateSnippetAction = useWritingStore((s) => s.updateSnippetAction);
  const deleteSnippetAction = useWritingStore((s) => s.deleteSnippetAction);
  const [name, setName] = useState(snippet.name || "");
  const [content, setContent] = useState(() => parseDisplayContent(snippet.content));
  // Track whether user has edited content — only save as _migrated_html if they have
  const contentEdited = useRef(false);

  useEffect(() => {
    setName(snippet.name || "");
    setContent(parseDisplayContent(snippet.content));
    contentEdited.current = false;
  }, [snippet.id, snippet.content, snippet.name]);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const saveName = async () => {
    if (name !== snippet.name) {
      await updateSnippetAction(snippet.id, { name });
    }
  };

  const saveContent = async () => {
    if (!contentEdited.current) return;
    contentEdited.current = false;
    const jsonContent = JSON.stringify({
      _migrated_html: true,
      html: content,
    });
    await updateSnippetAction(snippet.id, { content: jsonContent });
  };

  const handleTogglePin = () => {
    updateSnippetAction(snippet.id, { pinned: snippet.pinned ? 0 : 1 });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  const handleDelete = async () => {
    await deleteSnippetAction(snippet.id);
    onClose();
  };

  return (
    <div className="fixed top-[136px] z-40 shadow-2xl bg-[var(--color-surface-elevated)] rounded-xl" style={{ left: "var(--sidebar-width, 280px)", width: "min(34rem, calc(100vw - var(--sidebar-width, 280px) - 2rem))" }}>
      {/* Panel wrapper */}
      <div className="flex flex-col max-h-[36rem] rounded-xl overflow-hidden border border-[var(--color-border)]">
        {/* Top bar */}
        <div className="flex-none flex items-center gap-2 p-1.5 bg-[var(--color-surface-deep)] shadow">
          <button
            type="button"
            onClick={handleTogglePin}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors cursor-pointer",
              snippet.pinned
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"
            )}
          >
            {snippet.pinned ? (
              <Pin className="w-3 h-3" />
            ) : (
              <PinOff className="w-3 h-3" />
            )}
            Pin
          </button>

          <input
            className="flex-1 bg-transparent text-[14px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)]"
            placeholder="给片段起个名字…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />

          <DropdownMenu>
            <DropdownMenuTrigger className="size-7 flex items-center justify-center rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/10 transition-colors cursor-pointer">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" />
                Delete Snippet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={onClose}
            className="size-7 flex items-center justify-center rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content section */}
        <div className="flex-1 flex flex-col min-h-0 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase text-[var(--color-text-dim)] tracking-wide">
              Content
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              Open Snippet
            </button>
          </div>
          <textarea
            className="flex-1 w-full bg-transparent text-[14px] text-[var(--color-text-primary)] outline-none resize-none placeholder:text-[var(--color-text-dim)] leading-relaxed min-h-[10rem]"
            placeholder="开始输入…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={saveContent}
          />
        </div>

        {/* Bottom bar */}
        <div className="flex-none flex items-center gap-2 px-4 py-2 border-t border-[var(--color-border)]">
          <span className="text-[11px] text-[var(--color-text-dim)]">{wordCount} words</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/5 cursor-pointer transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

function extractText(doc: any): string {
  const texts: string[] = [];
  function walk(node: any) {
    if (node.text) texts.push(node.text);
    if (node.content) node.content.forEach(walk);
  }
  walk(doc);
  return texts.join("\n");
}
