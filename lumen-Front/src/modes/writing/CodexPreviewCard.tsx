import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWritingStore } from "../../stores/useWritingStore";
import type { CodexEntry } from "../../api/writing";
import { FileText, ArrowUpRight } from "lucide-react";
import { TYPE_ICONS, TYPE_LABELS } from "./codex-shared";

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function renderDesc(desc: Record<string, unknown>): React.ReactNode {
  if (!desc) return null;
  try {
    const doc = desc as any;
    if (doc.type === "doc" && Array.isArray(doc.content)) {
      const paras: string[] = [];
      for (const node of doc.content) {
        if (node.type === "paragraph" && Array.isArray(node.content)) {
          const texts = node.content
            .filter((n: any) => n.type === "text" && n.text)
            .map((n: any) => {
              let t = esc(n.text);
              if (n.marks) {
                for (const m of n.marks) {
                  if (m.type === "bold") t = `<strong>${t}</strong>`;
                  if (m.type === "italic") t = `<em>${t}</em>`;
                }
              }
              return t;
            })
            .join("");
          if (texts) paras.push(texts);
        }
        if (node.type === "heading") {
          const texts = node.content?.filter((n: any) => n.text).map((n: any) => esc(n.text)).join("") || "";
          if (texts) paras.push(`<strong>${texts}</strong>`);
        }
      }
      if (paras.length > 0) {
        return paras.map((html, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: html }} className={i > 0 ? "mt-1" : ""} />
        ));
      }
    }
  } catch {}
  return null;
}

function getParent(entry: CodexEntry, entries: CodexEntry[]): CodexEntry | null {
  if (!entry.parent_id) return null;
  return entries.find((e) => e.id === entry.parent_id) || null;
}

function getChildren(entry: CodexEntry, entries: CodexEntry[]): CodexEntry[] {
  return entries.filter((e) => e.parent_id === entry.id);
}

function getRelations(entry: CodexEntry, entries: CodexEntry[]): CodexEntry[] {
  return entry.relations
    ?.map((r) => entries.find((e) => e.id === r.target_id))
    .filter(Boolean) as CodexEntry[] || [];
}

export function CodexPreviewCard() {
  const [state, setState] = useState<{ entry: CodexEntry; x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const setActiveCodexEntry = useWritingStore((s) => s.setActiveCodexEntry);
  const entries = useWritingStore((s) => s.codexEntries);

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-codex-entry-id]") as HTMLElement;
      if (!target) return;

      const entryId = target.dataset.codexEntryId;
      const entry = useWritingStore.getState().codexEntries.find((e) => e.id === entryId);
      if (!entry) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = target.getBoundingClientRect();
      const cardW = 288;
      const x = Math.max(8, Math.min(rect.left + rect.width / 2 - cardW / 2, window.innerWidth - cardW - 8));
      const y = Math.min(rect.bottom + 6, window.innerHeight - 350);

      setState({ entry, x, y });
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    if (!state) return;
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [state, close]);

  if (!state) return null;

  const { entry, x, y } = state;
  const parent = getParent(entry, entries);
  const children = getChildren(entry, entries);
  const relations = getRelations(entry, entries);
  const allRelated = [...children, ...relations].slice(0, 5);
  const descContent = renderDesc(entry.description as Record<string, unknown>);

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-[9999] w-72 max-h-[50dvh] overflow-hidden rounded-lg shadow-xl ring-1 ring-zinc-700/50 bg-zinc-900 flex flex-col"
      style={{ left: x, top: y }}
    >
      {/* Header: type + name */}
      <div className="shrink-0 p-1">
        <button
          type="button"
          className="flex gap-3 p-1 w-full rounded hover:bg-zinc-800 transition-colors cursor-pointer text-left items-center"
          onClick={() => { setActiveCodexEntry(entry.id); close(); }}
        >
          <div className="p-2.5 flex-1 flex flex-col justify-center min-w-0">
            <div className="leading-none text-xs font-medium text-zinc-400 flex items-center gap-1">
              {TYPE_ICONS[entry.type] || <FileText className="w-4 h-4 opacity-75" />}
              <span>{TYPE_LABELS[entry.type] || entry.type}</span>
            </div>
            <div className="font-extrabold text-lg leading-tight mt-1.5 line-clamp-2 text-zinc-100">
              {entry.name}
            </div>
          </div>
        </button>
      </div>

      {/* Description */}
      {descContent && (
        <div className="px-4 pb-3 font-serif text-sm leading-relaxed text-zinc-400 max-h-32 overflow-y-auto">
          {descContent}
        </div>
      )}

      {/* Parent Relations */}
      {parent && (
        <div className="px-3 pb-1">
          <fieldset className="min-w-0">
            <legend className="uppercase text-[10px] font-semibold text-zinc-400 mb-1">Parent Relations</legend>
            <button
              type="button"
              className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer text-left text-sm text-zinc-300 w-full"
              onClick={() => { setActiveCodexEntry(parent.id); close(); }}
            >
              <span className="w-5 h-5 flex-none flex items-center justify-center text-zinc-500">
                {TYPE_ICONS[parent.type] || <FileText className="w-3.5 h-3.5" />}
              </span>
              <span className="truncate">{parent.name}</span>
            </button>
          </fieldset>
        </div>
      )}

      {/* Relations / Connections */}
      {allRelated.length > 0 && (
        <div className="px-3 pb-2">
          <fieldset className="min-w-0">
            <legend className="uppercase text-[10px] font-semibold text-zinc-400 mb-1">
              Relations / Connections
            </legend>
            <div className="flex flex-col divide-y divide-zinc-800 -mx-1 max-h-32 overflow-y-auto">
              {allRelated.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer text-left text-sm text-zinc-300"
                  onClick={() => {
                    setActiveCodexEntry(r.id);
                    close();
                  }}
                >
                  <span className="w-5 h-5 flex-none flex items-center justify-center text-zinc-500">
                    {TYPE_ICONS[r.type] || <FileText className="w-3.5 h-3.5" />}
                  </span>
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {/* Footer: Open button */}
      <div className="flex-none flex gap-1 justify-end p-1 border-t border-zinc-800">
        <button
          type="button"
          className="flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          onClick={() => { setActiveCodexEntry(entry.id); close(); }}
        >
          <ArrowUpRight className="w-3 h-3" />
          打开
        </button>
      </div>
    </div>,
    document.body
  );
}
