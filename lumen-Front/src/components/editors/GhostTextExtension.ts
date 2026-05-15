/**
 * GhostTextExtension — AI 续写预览文字 Mark
 *
 * 插入的文字标记为 ghostText（蓝色正文字体），
 * Tab/Apply 接受（移除 mark 保留文字），Esc 拒绝（删除所有 ghost 文字）。
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
        ({ state, view }: any) => {
          const tr = state.tr;
          const ghostMarkType = state.schema.marks.ghostText;
          if (!ghostMarkType) return false;

          let found = false;
          // 从后往前移除 mark，避免位置偏移
          const ranges: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            if (node.marks.some((m: any) => m.type.name === "ghostText")) {
              ranges.push({ from: pos, to: pos + node.nodeSize });
              found = true;
            }
          });

          if (!found) return false;

          for (let i = ranges.length - 1; i >= 0; i--) {
            tr.removeMark(ranges[i].from, ranges[i].to, ghostMarkType);
          }
          view.dispatch(tr);
          return true;
        },
      rejectGhost:
        () =>
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
        // 直接用 view.dispatch，绕过 chain
        const { state, view } = editor;
        const tr = state.tr;
        const ghostMarkType = state.schema.marks.ghostText;
        let found = false;
        const ranges: Array<{ from: number; to: number }> = [];
        state.doc.descendants((node: any, pos: number) => {
          if (!node.isText) return;
          if (node.marks.some((m: any) => m.type.name === "ghostText")) {
            ranges.push({ from: pos, to: pos + node.nodeSize });
            found = true;
          }
        });
        if (!found) return false;
        for (let i = ranges.length - 1; i >= 0; i--) {
          tr.removeMark(ranges[i].from, ranges[i].to, ghostMarkType);
        }
        view.dispatch(tr);
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
