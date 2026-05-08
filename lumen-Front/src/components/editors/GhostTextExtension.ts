/**
 * GhostTextExtension — AI 续写幽灵文字 Mark
 *
 * 插入的光标后文字标记为 ghostText（半透明倾斜），
 * Tab 接受（移除 mark 保留文字），Esc 拒绝（删除所有 ghost 文字）。
 */
import { Mark } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghostText: {
      setGhostText: () => ReturnType;
      acceptGhost: () => ReturnType;
      rejectGhost: () => ReturnType;
    };
  }
}

export const GhostTextExtension = Mark.create({
  name: "ghostText",

  addOptions() {
    return { HTMLAttributes: { class: "ghost-text" } };
  },

  parseHTML() {
    return [{ tag: "span.ghost-text" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "ghost-text" }, 0];
  },

  addCommands() {
    return {
      setGhostText:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      acceptGhost:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
      rejectGhost:
        () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ state, view }: any) => {
          const tr = state.tr;
          let deleted = 0;

          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            if (node.marks.some((m: any) => m.type.name === "ghostText")) {
              tr.delete(pos - deleted, pos + node.nodeSize - deleted);
              deleted += node.nodeSize;
            }
          });

          if (deleted > 0) {
            view.dispatch(tr);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const hasGhost = hasGhostMark(editor.state.doc);
        if (!hasGhost) return false;
        editor.chain().focus().unsetMark("ghostText").run();
        return true;
      },
      Escape: ({ editor }) => {
        const hasGhost = hasGhostMark(editor.state.doc);
        if (!hasGhost) return false;

        const { state, view } = editor;
        const tr = state.tr;
        let deleted = 0;

        state.doc.descendants((node: any, pos: number) => {
          if (!node.isText) return;
          if (node.marks.some((m: any) => m.type.name === "ghostText")) {
            tr.delete(pos - deleted, pos + node.nodeSize - deleted);
            deleted += node.nodeSize;
          }
        });

        if (deleted > 0) {
          view.dispatch(tr);
        }
        return true;
      },
    };
  },
});

function hasGhostMark(doc: any): boolean {
  let found = false;
  doc.descendants((node: any) => {
    if (node.isText && node.marks?.some((m: any) => m.type.name === "ghostText")) {
      found = true;
    }
  });
  return found;
}
