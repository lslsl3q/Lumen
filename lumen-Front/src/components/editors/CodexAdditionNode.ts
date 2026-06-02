import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodexAdditionView } from "./CodexAdditionView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    codexAddition: {
      insertCodexAddition: (options: { entryId: string; field?: string }) => ReturnType;
    };
  }
}

export const CodexAdditionNode = Node.create({
  name: "codexAddition",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      entryId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-entry-id") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.entryId) return {};
          return { "data-entry-id": attrs.entryId };
        },
      },
      field: {
        default: "description",
        parseHTML: (el) => el.getAttribute("data-field") ?? "description",
        renderHTML: (attrs) => {
          if (attrs.field === "description") return {};
          return { "data-field": attrs.field };
        },
      },
      mode: {
        default: "add",
        parseHTML: (el) => (el.getAttribute("data-mode") as "add" | "replace") ?? "add",
        renderHTML: (attrs) => {
          if (attrs.mode === "add") return {};
          return { "data-mode": "replace" };
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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="codex-addition"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "codex-addition",
        class: "codex-addition",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodexAdditionView);
  },

  addCommands() {
    return {
      insertCodexAddition:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "codexAddition",
            attrs: {
              entryId: options.entryId,
              field: options.field ?? "description",
              mode: "add",
            },
            content: [{ type: "paragraph" }],
          });
        },
    };
  },
});
