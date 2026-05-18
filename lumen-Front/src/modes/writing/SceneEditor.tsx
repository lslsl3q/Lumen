import { useRef, useEffect } from "react";
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
  // Handle legacy HTML wrapped content
  try {
    const parsed = JSON.parse(raw);
    if (parsed._migrated_html && parsed.html) {
      // Will be converted by migration utility in Phase 3
      return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: parsed.html.replace(/<[^>]+>/g, "") }] }] };
    }
  } catch {}
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function SceneEditor({ scene }: { scene: WritingScene }) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdate = useRef(false);
  const prevSceneId = useRef<string | null>(null);

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

  // Switch content when scene changes
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) return null;

  const wordCount = editor.storage?.characterCount?.words?.() ?? 0;

  return (
    <section className="scene-section flex gap-6">
      <div className="flex-1 min-w-0">
        <EditorContent editor={editor} />
      </div>
      <div className="w-64 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <p className="text-[11px] text-text-muted">
          Sc{scene.scene_number ? ` ${scene.scene_number}` : ""} — {wordCount} words
        </p>
        {scene.subtitle && (
          <p className="text-[12px] italic text-text-secondary mt-1">{scene.subtitle}</p>
        )}
        {scene.summary && (
          <p className="text-[12px] text-text-muted mt-1 line-clamp-3">{scene.summary}</p>
        )}
      </div>
    </section>
  );
}
