import type { Editor, Range } from "@tiptap/core";

export interface SlashCommandItem {
  title: string;
  description?: string;
  searchTerms?: string[];
  category?: "ai" | "codex" | "formatting" | "other";
  iconSvg?: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

// ── SVG 图标字符串（避免引入 react-dom/server） ──

const beatIcon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5M12 3.75v16.5M8.25 8.25l7.5 7.5M15.75 8.25l-7.5 7.5"/></svg>';

const continueIcon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>';

const codexIcon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>';

const lineIcon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M3 12h18"/></svg>';

const sectionIcon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 17.25h16.5M3.75 12h16.5"/></svg>';

const noteIcon = '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>';

// ── 命令列表（对应 NovelCrafter 6 项） ──

export const allCommands: SlashCommandItem[] = [
  // ── AI ──
  {
    title: "场景节拍",
    description: "AI 微控制器 — 写指令，AI 写正文",
    searchTerms: ["scene", "beat", "节拍", "场景"],
    category: "ai",
    iconSvg: beatIcon,
    command: ({ editor, range }) => {
      try {
        editor
          .chain()
          .focus()
          .insertContentAt(range, {
            type: "sceneBeat",
            attrs: { beatType: "beat", maxWords: 400 },
          })
          .run();
      } catch (e) {
        console.error("[SlashCmd] SceneBeat command error:", e);
      }
    },
  },
  {
    title: "续写场景",
    description: "创建新场景节拍继续写作",
    searchTerms: ["continue", "writing", "续写", "继续"],
    category: "ai",
    iconSvg: continueIcon,
    command: ({ editor, range }) => {
      try {
        editor.chain().focus().deleteRange(range).insertSceneBeat({
          beatType: "continue",
          maxWords: 400,
        }).run();
      } catch (e) {
        console.error("[SlashCmd] 续写场景 error:", e);
      }
    },
  },

  // ── Codex ──
  {
    title: "法典演进",
    description: "追踪角色/世界观在章节中的发展",
    searchTerms: ["codex", "progression", "法典", "演进", "设定"],
    category: "codex",
    iconSvg: codexIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: "codexProgression",
      }).run();
    },
  },

  // ── 格式 ──
  {
    title: "分割线",
    description: "水平虚线分割（NC 风格）",
    searchTerms: ["horizontal", "rule", "line", "divider", "分割线"],
    category: "formatting",
    iconSvg: lineIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Section Block",
    description: "插入可折叠的 Section 容器",
    searchTerms: ["section", "container", "折叠", "容器"],
    category: "formatting",
    iconSvg: sectionIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertSectionBlock().run();
    },
  },

  // ── 其他 ──
  {
    title: "笔记",
    description: "作者笔记（可排除字数统计）",
    searchTerms: ["note", "笔记", "备注"],
    category: "other",
    iconSvg: noteIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: "writingNote",
      }).run();
    },
  },
];

export const suggestionItems = allCommands;
