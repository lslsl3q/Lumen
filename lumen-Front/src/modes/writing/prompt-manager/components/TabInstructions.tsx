import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

const SYSTEM_SPLIT = /^# --- SYSTEM ---\s*$/m;
const USER_SPLIT = /^# --- USER ---\s*$/m;

function parseSections(content: string): { system: string; user: string } {
  const sysMatch = SYSTEM_SPLIT.exec(content);
  const usrMatch = USER_SPLIT.exec(content);

  if (!sysMatch) {
    return { system: content, user: "" };
  }

  const sysStart = sysMatch.index + sysMatch[0].length;
  const usrStart = usrMatch ? usrMatch.index : content.length;

  const system = content.slice(sysStart, usrStart).trim();
  const user = usrMatch ? content.slice(usrMatch.index + usrMatch[0].length).trim() : "";

  return { system, user };
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

interface TemplateEditorProps {
  value: string;
  onChange: (v: string) => void;
}

export function TemplateEditor({ value, onChange }: TemplateEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const syncingRef = useRef(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        oneDark,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "13px" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      syncingRef.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      syncingRef.current = false;
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Message section block — NC-style readonly preview with Copy */
function MessageSection({ label, content, color }: { label: string; content: string; color: "blue" | "emerald" | "amber" }) {
  const colorMap = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
  };

  if (!content) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[13px] font-medium ${colorMap[color]}`}>{label}</span>
        <span className="text-[11px] text-zinc-500">{wordCount(content)} words</span>
        <button
          onClick={() => navigator.clipboard.writeText(content).catch(() => {})}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
          type="button"
        >
          Copy
        </button>
      </div>
      <pre className="text-[12px] text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-800/30 rounded p-3 border border-zinc-700/30 leading-relaxed max-h-[200px] overflow-y-auto">
        {content || "(empty)"}
      </pre>
    </div>
  );
}

export { MessageSection, parseSections };
