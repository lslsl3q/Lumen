/**
 * SectionBlockNode — 可折叠、可命名、可拖拽的内容容器
 *
 * 纯容器节点，不涉及 AI 生成逻辑。
 * 内容以 HTML 存储，TipTap 的 parseHTML/renderHTML 自动处理序列化。
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SectionBlockView } from "./SectionBlockView";

/** 可选颜色标签 */
export const SECTION_COLORS = [
  "", "black", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
] as const;
export type SectionColor = (typeof SECTION_COLORS)[number];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionBlock: {
      insertSectionBlock: (options?: { title?: string }) => ReturnType;
      toggleSectionBlockCollapsed: () => ReturnType;
    };
  }
}

export const SectionBlockNode = Node.create({
  name: "sectionBlock",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.title) return {};
          return { "data-title": attrs.title };
        },
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) => {
          if (!attrs.collapsed) return {};
          return { "data-collapsed": "true" };
        },
      },
      hideFromAI: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-hide-from-ai") === "true",
        renderHTML: (attrs) => {
          if (!attrs.hideFromAI) return {};
          return { "data-hide-from-ai": "true" };
        },
      },
      hideFromCount: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-hide-from-count") === "true",
        renderHTML: (attrs) => {
          if (!attrs.hideFromCount) return {};
          return { "data-hide-from-count": "true" };
        },
      },
      color: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-color") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.color) return {};
          return { "data-color": attrs.color };
        },
      },
      variant: {
        default: "section",
        parseHTML: (el) => (el.getAttribute("data-variant") as "section" | "note") ?? "section",
        renderHTML: (attrs) => {
          if (attrs.variant === "section") return {};
          return { "data-variant": "note" };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "section-block",
        class: "section-block",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionBlockView);
  },

  addCommands() {
    return {
      insertSectionBlock:
        (options = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "sectionBlock",
            attrs: {
              title: options.title ?? "",
            },
            content: [
              {
                type: "paragraph",
              },
            ],
          });
        },
      toggleSectionBlockCollapsed:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== this.name) continue;
            if (dispatch) {
              dispatch(
                state.tr.setNodeMarkup($from.before(depth), undefined, {
                  ...node.attrs,
                  collapsed: !node.attrs.collapsed,
                })
              );
            }
            return true;
          }
          return false;
        },
    };
  },
});
