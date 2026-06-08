import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { User, Bot } from "lucide-react";
import { jinja2Extensions } from "./jinja2Lang";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?\r?\n)---\r?\n?/;
const SECTION_DELIMITER = /^# --- (SYSTEM|USER|ASSISTANT) ---\s*$/gm;

const ROLE_MAP: Record<string, MessageSection["role"]> = {
  SYSTEM: "system",
  USER: "user",
  ASSISTANT: "assistant",
};

export interface MessageSection {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ParsedTemplate {
  frontmatter: string;
  sections: MessageSection[];
}

export function parseTemplate(content: string): ParsedTemplate {
  let frontmatter = "";
  let body = content;

  const fmMatch = FRONTMATTER_RE.exec(content);
  if (fmMatch) {
    frontmatter = content.slice(0, fmMatch.index + fmMatch[0].length);
    body = content.slice(fmMatch.index + fmMatch[0].length);
  }

  const delimiters: { role: MessageSection["role"]; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = SECTION_DELIMITER.exec(body)) !== null) {
    delimiters.push({
      role: ROLE_MAP[m[1]] ?? "user",
      index: m.index,
      end: m.index + m[0].length,
    });
  }

  if (delimiters.length === 0) {
    const trimmed = body.trim();
    return {
      frontmatter,
      sections: trimmed ? [{ role: "system", content: trimmed }] : [],
    };
  }

  const sections: MessageSection[] = delimiters.map((d, i) => {
    const next = i + 1 < delimiters.length ? delimiters[i + 1].index : body.length;
    return { role: d.role, content: body.slice(d.end, next).trim() };
  });

  return { frontmatter, sections };
}

export function serializeTemplate(parsed: ParsedTemplate): string {
  const parts: string[] = [];

  if (parsed.frontmatter) {
    parts.push(parsed.frontmatter);
  }

  const roleLabels: Record<MessageSection["role"], string> = {
    system: "SYSTEM",
    user: "USER",
    assistant: "ASSISTANT",
  };

  for (const section of parsed.sections) {
    parts.push(`# --- ${roleLabels[section.role]} ---\n`);
    if (section.content) {
      parts.push(section.content);
      if (!section.content.endsWith("\n")) parts.push("\n");
    }
  }

  return parts.join("");
}

/** @deprecated Use parseTemplate instead */
function parseSections(content: string): { system: string; user: string } {
  const parsed = parseTemplate(content);
  const system = parsed.sections.find((s) => s.role === "system")?.content ?? "";
  const user = parsed.sections.find((s) => s.role === "user")?.content ?? "";
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
        ...jinja2Extensions(),
        oneDark,
        history(),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "13px", lineHeight: "1.7" },
          ".cm-gutters": { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "13px", lineHeight: "1.7", backgroundColor: "transparent", borderRight: "1px solid rgba(63,63,70,0.4)", color: "#52525b", paddingRight: "4px" },
          ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.04)" },
          ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.04)", color: "#a1a1aa" },
          ".cm-foldGutter": { width: "12px" },
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

/** Editable message block — NC-style per-section editor (no drag handle, that's in InstructionsPanel) */
interface MessageBlockProps {
  section: MessageSection;
  index: number;
  isSystem: boolean;
  onChange: (index: number, content: string) => void;
  onRoleChange: (index: number, role: MessageSection["role"]) => void;
  onDelete: (index: number) => void;
}

function MessageBlock({ section, index, isSystem, onChange, onRoleChange, onDelete }: MessageBlockProps) {
  return (
    <div className="shadow-sm p-2 rounded-md border border-zinc-700/40 flex flex-col gap-2">
      {/* Header bar */}
      <div className="flex justify-between items-center gap-2">
        {/* Role: system shows label, others show segmented toggle */}
        {isSystem ? (
          <span className="text-[12px] font-semibold text-stone-100">System Message</span>
        ) : (
          <div className="flex -space-x-px [&>:not(:first-child)]:rounded-l-none [&>:not(:last-child)]:rounded-r-none">
            <button
              onClick={() => onRoleChange(index, "user")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-semibold border transition-colors cursor-pointer ${
                section.role === "user"
                  ? "bg-zinc-700 border-zinc-600 text-stone-100"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
              type="button"
            >
              <User className="w-4 h-4" />
              User
            </button>
            <button
              onClick={() => onRoleChange(index, "assistant")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-semibold border transition-colors cursor-pointer ${
                section.role === "assistant"
                  ? "bg-zinc-700 border-zinc-600 text-stone-100"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
              type="button"
            >
              <Bot className="w-4 h-4" />
              AI
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Copy */}
          <button
            onClick={() => navigator.clipboard.writeText(section.content).catch(() => {})}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
            type="button"
          >
            Copy
          </button>

          {/* Delete — only for non-system */}
          {!isSystem && (
            <button
              onClick={() => onDelete(index)}
              className="text-[11px] text-zinc-500 hover:text-red-400 cursor-pointer"
              type="button"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="h-[200px] rounded overflow-hidden border border-zinc-700/30">
        <TemplateEditor
          value={section.content}
          onChange={(v) => onChange(index, v)}
        />
      </div>
    </div>
  );
}

export { MessageSection, parseSections, MessageBlock };
