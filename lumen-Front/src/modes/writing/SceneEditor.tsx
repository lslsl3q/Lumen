import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { CharacterCount } from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import { GhostTextExtension } from "../../components/editors/GhostTextExtension";
import { SlashCommandExtension } from "../../components/editors/SlashCommandExtension";
import { SceneBeatNode } from "../../components/editors/SceneBeatNode";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { Tag, Plus, Trash2, Settings2 } from "lucide-react";

const LABEL_COLORS: { key: string; hex: string }[] = [
  { key: "Black", hex: "#1f2937" },
  { key: "Gray", hex: "#6b7280" },
  { key: "Brown", hex: "#92400e" },
  { key: "Orange", hex: "#ea580c" },
  { key: "Yellow", hex: "#ca8a04" },
  { key: "Green", hex: "#16a34a" },
  { key: "Blue", hex: "#2563eb" },
  { key: "Purple", hex: "#7c3aed" },
  { key: "Pink", hex: "#db2777" },
  { key: "Red", hex: "#dc2626" },
];

const LABEL_COLOR_MAP = Object.fromEntries(LABEL_COLORS.map(c => [c.key, c.hex]));
import { ActionsMenu } from "./ActionsMenu";
import { SelectionToolbar } from "../../components/editors/SelectionToolbar";
import type { WritingScene, WritingThreadNode } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

const sceneExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
  Placeholder.configure({ placeholder: "开始写作，或输入 '/' 以使用命令…" }),
  CharacterCount,
  Highlight.configure({ multicolor: true }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "editor-link" } }),
  Typography,
  TextStyle,
  Color,
  FontFamily,
  GhostTextExtension,
  SlashCommandExtension,
  SceneBeatNode,
];

function parseContent(raw: string): object {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === "doc") return parsed;
  } catch {}
  try {
    const parsed = JSON.parse(raw);
    if (parsed._migrated_html && parsed.html) {
      return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: parsed.html.replace(/<[^>]+>/g, "") }] }] };
    }
  } catch {}
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function SceneEditor({ scene, compact = false }: { scene: WritingScene; compact?: boolean }) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdate = useRef(false);
  const prevSceneId = useRef<string | null>(null);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [summaryText, setSummaryText] = useState(scene.summary || "");

  const editor = useEditor({
    extensions: sceneExtensions,
    content: parseContent(scene.content),
    editable: !compact,
    editorProps: {
      attributes: {
        class: "rich-text-editor-prosemirror outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isInternalUpdate.current) return;
      useWritingStore.setState({ contentDirty: true });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = ed.getJSON();
        useWritingStore.getState().updateSceneContent(scene.id, json);
      }, 500);
    },
  });

  useEffect(() => {
    if (!editor || scene.id === prevSceneId.current) return;
    prevSceneId.current = scene.id;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    isInternalUpdate.current = true;
    editor.commands.setContent(parseContent(scene.content));
    requestAnimationFrame(() => { isInternalUpdate.current = false; });
  }, [scene.id, scene.content, editor]);

  // Sync summary text when scene changes externally
  useEffect(() => {
    if (!summaryEditing) setSummaryText(scene.summary || "");
  }, [scene.summary, scene.id, summaryEditing]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor && !compact) return null;

  const codexEntries = useWritingStore((s) => s.codexEntries);
  const allThreads = useWritingStore((s) => s.threads);
  const allThreadNodes = useWritingStore((s) => s.threadNodes);

  const associatedCodex = useMemo(() => {
    const explicitIds = new Set(
      Array.isArray(scene.codex_ids) ? scene.codex_ids : (() => { try { return JSON.parse(scene.codex_ids || "[]"); } catch { return []; } })(),
    );
    const summary = (scene.summary || "").toLowerCase();
    let contentText = "";
    try {
      const doc = JSON.parse(scene.content);
      const texts: string[] = [];
      const walk = (n: any) => { if (n.text) texts.push(n.text); if (n.content) n.content.forEach(walk); };
      walk(doc);
      contentText = texts.join("").toLowerCase();
    } catch {}
    const combined = summary + " " + contentText;
    const detected = new Set(explicitIds);
    for (const entry of codexEntries) {
      if (detected.has(entry.id)) continue;
      const names = [entry.name, ...(entry.aliases || [])].filter(Boolean).map(n => n.toLowerCase());
      if (names.some(n => n.length >= 2 && combined.includes(n))) {
        detected.add(entry.id);
      }
    }
    return codexEntries.filter(e => detected.has(e.id));
  }, [scene.codex_ids, scene.summary, scene.content, codexEntries]);

  const sceneThreadNodes = useMemo(() => {
    const result: (WritingThreadNode & { threadName: string; threadColor: string })[] = [];
    for (const thread of allThreads) {
      const nodes = allThreadNodes[thread.id] || [];
      for (const node of nodes) {
        if (node.scene_id === scene.id) {
          result.push({ ...node, threadName: thread.name, threadColor: thread.color });
        }
      }
    }
    return result;
  }, [scene.id, allThreads, allThreadNodes]);

  const toggleCodex = useCallback((codexId: string) => {
    const currentIds: string[] = Array.isArray(scene.codex_ids) ? [...scene.codex_ids] : (() => { try { return JSON.parse(scene.codex_ids || "[]"); } catch { return []; } })();
    const idx = currentIds.indexOf(codexId);
    if (idx >= 0) currentIds.splice(idx, 1);
    else currentIds.push(codexId);
    useWritingStore.getState().patchScene(scene.id, { codex_ids: currentIds } as any);
  }, [scene.id, scene.codex_ids]);

  const allLabels = useWritingStore((s) => s.labels);
  const currentLabelIds: string[] = useMemo(() => {
    if (Array.isArray((scene as any).label_ids)) return (scene as any).label_ids;
    try { return JSON.parse(((scene as any).label_ids as string) || "[]"); } catch { return []; }
  }, [(scene as any).label_ids]);

  const toggleLabel = useCallback((labelId: string) => {
    const ids = [...currentLabelIds];
    const idx = ids.indexOf(labelId);
    if (idx >= 0) ids.splice(idx, 1);
    else ids.push(labelId);
    useWritingStore.getState().patchScene(scene.id, { label_ids: ids } as any);
  }, [scene.id, currentLabelIds]);

  const handleAddThreadNode = useCallback((threadId: string) => {
    useWritingStore.getState().createThreadNodeAction(threadId, "advance", "", scene.id);
  }, [scene.id]);

  const wordCount = editor.storage?.characterCount?.words?.() ?? 0;
  const sceneNumber = scene.scene_number ?? 0;

  const handleSummaryBlur = async () => {
    setSummaryEditing(false);
    if (summaryText !== (scene.summary || "")) {
      useWritingStore.getState().patchScene(scene.id, { summary: summaryText });
    }
  };

  const handleDelete = async () => {
    await useWritingStore.getState().deleteSceneAction(scene.id);
  };

  // Compact mode: summary textarea + action bar (used in Plan Grid & Matrix)
  if (compact) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 overflow-auto px-2 py-1.5">
          <textarea
            className="w-full min-h-[48px] text-[13px] leading-[20px] text-zinc-300 bg-transparent resize-none outline-none placeholder:text-zinc-600"
            placeholder="场景摘要…"
            value={summaryText}
            onChange={(e) => { setSummaryText(e.target.value); autoResize(e.currentTarget); }}
            onFocus={(e) => { setSummaryEditing(true); autoResize(e.currentTarget); }}
            onBlur={handleSummaryBlur}
            onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
            rows={2}
            spellCheck={false}
          />
        </div>
        <div className="flex items-center gap-1 px-2 py-1 border-t border-zinc-800/60 text-[11px] text-zinc-500 shrink-0 flex-wrap">
          <ActionsMenu iconSize="w-3 h-3" className="flex items-center gap-0.5 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer">
            <DropdownMenuItem>与场景对话</DropdownMenuItem>
            <DropdownMenuItem>AI 摘要</DropdownMenuItem>
            <DropdownMenuItem>复制正文</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              删除场景
            </DropdownMenuItem>
          </ActionsMenu>

          {/* Label tags */}
          <SceneLabelTags scene={scene} compact />

          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-0.5 py-0.5 px-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Tag className="w-2.5 h-2.5" />
              Label
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="!w-[180px] p-0 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl">
              <LabelPickerContent allLabels={allLabels} currentLabelIds={currentLabelIds} onToggle={toggleLabel} />
            </PopoverContent>
          </Popover>

          {/* Codex tags */}
          {associatedCodex.map(entry => (
            <button
              key={entry.id}
              onClick={() => toggleCodex(entry.id)}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-800/80 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer max-w-[72px] truncate"
              title={`${entry.name}（点击移除）`}
              type="button"
            >
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-0.5 py-0.5 px-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Plus className="w-2.5 h-2.5" />
              Codex
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-52 max-h-48 overflow-y-auto p-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
              {codexEntries
                .filter(e => !associatedCodex.some(a => a.id === e.id))
                .length === 0 && (
                <div className="px-2 py-2 text-[11px] text-zinc-500 text-center">所有条目已关联</div>
              )}
              {codexEntries
                .filter(e => !associatedCodex.some(a => a.id === e.id))
                .map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => toggleCodex(entry.id)}
                    className="w-full text-left px-2 py-1 rounded text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer truncate"
                    type="button"
                  >
                    {entry.name}
                  </button>
                ))}
            </PopoverContent>
          </Popover>

          {/* Thread tags */}
          {sceneThreadNodes.map(node => (
            <span
              key={node.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate max-w-[72px]"
              style={{ color: node.threadColor, background: node.threadColor + "15" }}
              title={`${node.threadName} — ${node.title || node.type}`}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: node.threadColor }} />
              <span className="truncate">{node.threadName || "未命名"}</span>
            </span>
          ))}
          {allThreads.length > 0 && (
            <Popover>
              <PopoverTrigger
                className="inline-flex items-center gap-0.5 py-0.5 px-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />
                Thread
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-48 max-h-48 overflow-y-auto p-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
                {allThreads.map(thread => (
                  <button
                    key={thread.id}
                    onClick={() => handleAddThreadNode(thread.id)}
                    className="w-full text-left px-2 py-1 rounded text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5"
                    type="button"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: thread.color }} />
                    {thread.name || "未命名"}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}

          <div className="flex-1" />
          <span className="text-zinc-600 tabular-nums shrink-0">{wordCount}w</span>
        </div>
      </div>
    );
  }

  return (
    <section className="scene-section">
      <div className="manuscript-inner flex flex-col lg:flex-row lg:gap-[var(--gap)]">
      <div className="manuscript-content">
        <EditorContent editor={editor} />
        <SelectionToolbar editor={editor} />
      </div>

      <div className="manuscript-side opacity-70 hover:opacity-100 transition-opacity">
        <div className="scene-sidebar py-2 px-1.5">
          <div className="text-xs mb-1">
            <span className="uppercase font-bold text-[var(--color-text-muted)]">
              Sc{sceneNumber || ""}
            </span>
            <span className="font-medium text-[var(--color-text-dim)]">
              {" — "}
              <span className="whitespace-nowrap">{wordCount} words</span>
            </span>
          </div>

          {scene.subtitle && (
            <div className="text-sm italic font-medium text-[var(--color-text-dim)] truncate mb-1">
              {scene.subtitle}
            </div>
          )}

          <div className="mt-1">
            <textarea
              readOnly={!summaryEditing}
              className="w-full min-h-[24px] text-[var(--color-text-dim)] text-sm leading-relaxed resize-none outline-none cursor-text transition-colors"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: summaryEditing ? 'var(--color-text-secondary)' : undefined,
              }}
              placeholder="场景摘要…"
              value={summaryText}
              onFocus={(e) => {
                setSummaryEditing(true);
                autoResize(e.currentTarget);
              }}
              onChange={(e) => {
                setSummaryText(e.target.value);
                autoResize(e.currentTarget);
              }}
              onBlur={handleSummaryBlur}
              onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
              rows={1}
            />
          </div>

          <div className="flex gap-2.5 pt-1 flex-wrap">
            <ActionsMenu iconSize="w-3 h-3" className="flex items-center gap-1 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors cursor-pointer">
              <DropdownMenuItem>与场景对话</DropdownMenuItem>
              <DropdownMenuItem>AI 摘要</DropdownMenuItem>
              <DropdownMenuItem>检测角色</DropdownMenuItem>
              <DropdownMenuItem>复制正文</DropdownMenuItem>
              <DropdownMenuItem>导出场景</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" />
                删除场景
              </DropdownMenuItem>
            </ActionsMenu>

            <Popover>
            <PopoverTrigger
              className="flex items-center gap-1 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Tag className="w-3 h-3" />
              Label
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="!w-[180px] p-0 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl">
              <LabelPickerContent allLabels={allLabels} currentLabelIds={currentLabelIds} onToggle={toggleLabel} />
            </PopoverContent>
          </Popover>

            {/* Label tags */}
            <SceneLabelTags scene={scene} />

            {/* Codex tags */}
            {associatedCodex.map(entry => (
              <button
                key={entry.id}
                onClick={() => toggleCodex(entry.id)}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-800/80 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer truncate max-w-[80px]"
                title={`${entry.name}（点击移除）`}
                type="button"
              >
                {entry.name}
              </button>
            ))}
            <Popover>
              <PopoverTrigger
                className="flex items-center gap-1 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Codex
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-52 max-h-52 overflow-y-auto p-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
                {codexEntries.filter(e => !associatedCodex.some(a => a.id === e.id)).length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-zinc-500 text-center">所有条目已关联</div>
                )}
                {codexEntries.filter(e => !associatedCodex.some(a => a.id === e.id)).map(entry => (
                  <button key={entry.id} onClick={() => toggleCodex(entry.id)}
                    className="w-full text-left px-2 py-1 rounded text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer truncate" type="button">
                    {entry.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Thread tags */}
            {sceneThreadNodes.map(node => (
              <span key={node.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[80px]"
                style={{ color: node.threadColor, background: node.threadColor + "15" }}
                title={`${node.threadName} — ${node.title || node.type}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: node.threadColor }} />
                <span className="truncate">{node.threadName || "未命名"}</span>
              </span>
            ))}
            {allThreads.length > 0 && (
              <Popover>
                <PopoverTrigger
                  className="flex items-center gap-1 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Thread
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-48 max-h-48 overflow-y-auto p-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
                  {allThreads.map(thread => (
                    <button key={thread.id} onClick={() => handleAddThreadNode(thread.id)}
                      className="w-full text-left px-2 py-1 rounded text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5" type="button">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: thread.color }} />
                      {thread.name || "未命名"}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

function LabelPickerContent({
  allLabels,
  currentLabelIds,
  onToggle,
}: {
  allLabels: import("../../api/writing").WritingLabel[];
  currentLabelIds: string[];
  onToggle: (id: string) => void;
}) {
  const openManage = useCallback(() => {
    useWritingStore.getState().setShowSettingsPanel(true, "writing");
  }, []);

  return (
    <div className="max-h-[240px] overflow-y-auto">
      {/* Label list */}
      {allLabels.length === 0 && (
        <div className="px-3 py-3 text-[11px] text-zinc-500 text-center">暂无标签</div>
      )}
      <div className="p-1">
        {allLabels.map(label => {
          const active = currentLabelIds.includes(label.id);
          return (
            <button
              key={label.id}
              onClick={() => onToggle(label.id)}
              className="w-full text-left px-2 py-1.5 rounded-sm text-[12px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-2"
              type="button"
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: LABEL_COLOR_MAP[label.color] || "#6b7280" }}
              />
              <span className="truncate flex-1">{label.name || "Unnamed"}</span>
              {active && <span className="text-zinc-500 text-[10px]">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Manage link */}
      <div className="border-t border-zinc-700/50 mx-1" />
      <div className="p-1">
        <button
          onClick={openManage}
          className="w-full text-left px-2 py-1.5 rounded-sm text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors cursor-pointer flex items-center gap-2"
          type="button"
        >
          <Settings2 className="w-3 h-3" />
          管理标签…
        </button>
      </div>
    </div>
  );
}

function SceneLabelTags({ scene, compact = false }: { scene: WritingScene; compact?: boolean }) {
  const labels = useWritingStore((s) => s.labels);
  const ids: string[] = useMemo(() => {
    if (Array.isArray((scene as any).label_ids)) return (scene as any).label_ids;
    try { return JSON.parse(((scene as any).label_ids as string) || "[]"); } catch { return []; }
  }, [(scene as any).label_ids]);

  const active = labels.filter(l => ids.includes(l.id));
  if (active.length === 0) return null;

  const maxShow = compact ? 3 : 5;
  const shown = active.slice(0, maxShow);

  return (
    <>
      {shown.map(label => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-sm text-[10px] truncate"
          style={{
            color: LABEL_COLOR_MAP[label.color] || "#6b7280",
            background: (LABEL_COLOR_MAP[label.color] || "#6b7280") + "20",
            maxWidth: compact ? 60 : 80,
            padding: "1px 4px",
          }}
          title={label.name}
        >
          <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: LABEL_COLOR_MAP[label.color] || "#6b7280" }} />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {active.length > maxShow && (
        <span className="text-[10px] text-zinc-500">+{active.length - maxShow}</span>
      )}
    </>
  );
}
