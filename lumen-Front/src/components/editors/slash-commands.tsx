import type { SuggestionItem } from "novel";

// 内联 SVG 图标，避免引入 lucide-react

const IconH1 = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h8M12 6v12M17 12l3-2v8" />
  </svg>
);

const IconH2 = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h8M12 6v12M18 10a2 2 0 11-2 2m4 4h-4" />
  </svg>
);

const IconH3 = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h8M12 6v12M17.5 10.5a2 2 0 11-1 3.5h-1.5m2.5 2.5a2 2 0 11-1.5-3.5" />
  </svg>
);

const IconList = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

const IconOrderedList = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h11M10 12h11M10 18h11M4 6v4M3 20h2M4 14c1 0 2-.5 2-1.5S5 11 4 11H3l1.5-1" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M3 6h18M3 12h18M3 18h18" />
  </svg>
);

const IconQuote = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 11V8a2 2 0 00-2-2H6a2 2 0 00-2 2v3a2 2 0 002 2h2m0 0v4m0-4h2m6-3V8a2 2 0 00-2-2h-2a2 2 0 00-2 2v3a2 2 0 002 2h2m0 0v4m0-4h2" />
  </svg>
);

const IconCode = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
  </svg>
);

const IconText = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h10.5" />
  </svg>
);

const IconLine = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" d="M3 12h18" />
  </svg>
);

export const suggestionItems: SuggestionItem[] = [
  {
    title: "文本",
    description: "普通段落文本",
    searchTerms: ["text", "paragraph", "p"],
    icon: <IconText />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run();
    },
  },
  {
    title: "标题 1",
    description: "大标题",
    searchTerms: ["title", "heading", "h1"],
    icon: <IconH1 />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "标题 2",
    description: "中标题",
    searchTerms: ["subtitle", "heading", "h2"],
    icon: <IconH2 />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "标题 3",
    description: "小标题",
    searchTerms: ["subtitle", "heading", "h3"],
    icon: <IconH3 />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "列表",
    description: "无序列表",
    searchTerms: ["bullet", "list", "unordered"],
    icon: <IconList />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "编号列表",
    description: "有序编号列表",
    searchTerms: ["ordered", "numbered"],
    icon: <IconOrderedList />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "待办",
    description: "任务清单",
    searchTerms: ["todo", "task", "check", "checkbox"],
    icon: <IconCheck />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "引用",
    description: "引用块",
    searchTerms: ["quote", "blockquote"],
    icon: <IconQuote />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "代码块",
    description: "代码片段",
    searchTerms: ["code", "codeblock"],
    icon: <IconCode />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "分割线",
    description: "水平分割线",
    searchTerms: ["horizontal", "rule", "line", "divider"],
    icon: <IconLine />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];
