import {
  StarterKit,
  TaskList,
  TaskItem,
  TiptapUnderline,
  Placeholder,
  HighlightExtension,
} from "novel";
import { Markdown } from "tiptap-markdown";

export const defaultExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Markdown.configure({
    transformPastedText: true,
    transformCopiedText: true,
    breaks: true,
    html: false,
  }),
  Placeholder.configure({
    placeholder: "开始写作…",
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  HighlightExtension,
  TiptapUnderline,
];
