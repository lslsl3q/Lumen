import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";

/**
 * Converts legacy HTML content to ProseMirror JSON.
 * Uses a temporary headless TipTap editor to parse HTML and export JSON.
 */
export function htmlToProseMirrorJSON(html: string): object {
  if (!html || !html.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Highlight,
      Underline,
      Link,
      Typography,
    ],
    content: html,
  });

  const json = editor.getJSON();
  editor.destroy();
  return json;
}

/**
 * Batch convert migrated scenes: iterates manuscript, finds scenes
 * with _migrated_html marker, converts them, and saves back via updateScene.
 */
export async function convertMigratedScenes(
  projectId: string,
  getManuscriptFn: (projectId: string) => Promise<any>,
  updateSceneFn: (sceneId: string, content: object) => Promise<any>,
): Promise<number> {
  const manuscript = await getManuscriptFn(projectId);
  let converted = 0;

  for (const act of manuscript.acts || []) {
    for (const ch of act.chapters || []) {
      for (const sc of ch.scenes || []) {
        let content: any;
        try {
          content = JSON.parse(sc.content);
        } catch {
          continue;
        }
        // Check for _migrated_html marker from backend migration
        if (content._migrated_html && content.html) {
          const pmJson = htmlToProseMirrorJSON(content.html);
          await updateSceneFn(sc.id, pmJson);
          converted++;
        }
      }
    }
  }

  return converted;
}
