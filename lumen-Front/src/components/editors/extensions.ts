/**
 * TipTap 3.x 默认扩展配置
 *
 * 内容以 HTML 存储（更健壮），不再用 Markdown 做中间格式。
 * tiptap-markdown 仅用于导入/导出，不参与日常编辑。
 */
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import { CharacterCount } from "@tiptap/extension-character-count";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import { FocusModeExtension } from "./FocusModeExtension";
import { GhostTextExtension } from "./GhostTextExtension";
import { SlashCommandExtension } from "./SlashCommandExtension";
import { SceneBeatNode } from "./SceneBeatNode";
import { SectionBlockNode } from "./SectionBlockNode";

export const defaultExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
    underline: false,
  }),
  Placeholder.configure({
    placeholder: "开始写作…",
  }),
  CharacterCount,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight.configure({ multicolor: true }),
  Underline,
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
  Superscript,
  Subscript,
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { class: "editor-link" },
  }),
  Typography,
  TableKit,
  Image.configure({ allowBase64: true, inline: false }),
  TextStyle,
  Color,
  FontFamily,
  FocusModeExtension,
  GhostTextExtension,
  SlashCommandExtension,
  SceneBeatNode,
  SectionBlockNode,
];
