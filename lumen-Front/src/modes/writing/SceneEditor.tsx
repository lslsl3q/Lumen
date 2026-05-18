import { useRef, useEffect, useState } from "react";
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
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../components/ui/popover";
import { MoreHorizontal, Tag, Plus, Trash2 } from "lucide-react";
import type { WritingScene } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";
import * as writingApi from "../../api/writing";

const sceneExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
  Placeholder.configure({ placeholder: "开始写作…" }),
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

export function SceneEditor({ scene }: { scene: WritingScene }) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdate = useRef(false);
  const prevSceneId = useRef<string | null>(null);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [summaryText, setSummaryText] = useState(scene.summary || "");

  const editor = useEditor({
    extensions: sceneExtensions,
    content: parseContent(scene.content),
    editable: true,
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
        writingApi.updateScene(scene.id, { content: json as any });
        useWritingStore.setState({ saveStatus: "saved", lastSavedAt: Date.now() });
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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) return null;

  const wordCount = editor.storage?.characterCount?.words?.() ?? 0;
  const sceneNumber = scene.scene_number ?? 0;

  const handleSummaryBlur = async () => {
    setSummaryEditing(false);
    if (summaryText !== (scene.summary || "")) {
      await writingApi.updateScene(scene.id, { summary: summaryText });
    }
  };

  const handleDelete = async () => {
    await useWritingStore.getState().deleteSceneAction(scene.id);
  };

  return (
    <section className="scene-section flex flex-col lg:flex-row lg:gap-6 2xl:gap-8">
      <div className="flex-1 min-w-0">
        <EditorContent editor={editor} />
      </div>

      <div className="w-full sm:w-3/4 md:w-3/5 lg:w-64 2xl:w-80 shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <div className="scene-sidebar py-2">
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
            {summaryEditing ? (
              <textarea
                autoFocus
                className="w-full min-h-[50px] bg-white/5 border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-secondary)] text-sm leading-relaxed resize-y outline-none focus:border-[var(--color-text-dim)] transition-colors"
                placeholder="场景摘要…"
                defaultValue={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                onBlur={handleSummaryBlur}
                onKeyDown={(e) => { if (e.key === "Escape") setSummaryEditing(false); }}
              />
            ) : (
              <div
                className="text-[var(--color-text-dim)] text-sm leading-relaxed cursor-text hover:text-[var(--color-text-muted)] transition-colors"
                onClick={() => setSummaryEditing(true)}
              >
                {scene.summary || "场景摘要…"}
              </div>
            )}
          </div>

          <div className="flex gap-0.5 pt-1">
            <Popover>
              <PopoverTrigger
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
                type="button"
              >
                <MoreHorizontal className="w-3 h-3" />
                Actions
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-44 p-1 bg-[var(--color-surface-deep)] border-[var(--color-border)] rounded-lg shadow-xl"
              >
                {[
                  { label: "与场景对话" },
                  { label: "AI 摘要" },
                  { label: "检测角色" },
                  { label: "复制正文" },
                  { label: "导出场景" },
                  { label: "归档", muted: true },
                ].map((item) => (
                  <button
                    key={item.label}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] rounded transition-colors ${
                      item.muted
                        ? "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-deep)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-deep)]"
                    }`}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
                <div className="h-px bg-[var(--color-border)] my-1" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] rounded text-[var(--color-error-light)] hover:bg-red-400/10 transition-colors"
                  type="button"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除场景
                </button>
              </PopoverContent>
            </Popover>

            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
              type="button"
            >
              <Tag className="w-3 h-3" />
              Label
            </button>

            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
              type="button"
            >
              <Plus className="w-3 h-3" />
              Codex
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
