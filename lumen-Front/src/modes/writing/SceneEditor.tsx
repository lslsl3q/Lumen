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
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { Tag, Plus, Trash2 } from "lucide-react";
import { ActionsMenu } from "./ActionsMenu";
import { SelectionToolbar } from "../../components/editors/SelectionToolbar";
import type { WritingScene } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";
import * as writingApi from "../../api/writing";

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

const sceneExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
  Placeholder.configure({ placeholder: "开始写作，或按 / 使用命令…" }),
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

          <div className="flex gap-2.5 pt-1">
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

            <button
              className="flex items-center gap-1 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
              type="button"
            >
              <Tag className="w-3 h-3" />
              Label
            </button>

            <button
              className="flex items-center gap-1 py-0.5 rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
              type="button"
            >
              <Plus className="w-3 h-3" />
              Codex
            </button>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
