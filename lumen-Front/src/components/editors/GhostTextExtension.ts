/**
 * GhostTextExtension — AI 续写预览文字 Mark
 *
 * 插入的文字标记为 ghostText（蓝色正文字体），
 * Tab/Apply 接受（移除 mark 保留文字），Esc 拒绝（删除所有 ghost 文字）。
 *
 * 支持替换模式：Esc 拒绝时自动恢复被替换的原始文字。
 * 通过 editor.storage.ghostText.replaceData 激活。
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

  addStorage() {
    return {
      /** 替换模式数据 — Esc 拒绝后恢复原始文字 */
      replaceData: null as { from: number; originalText: string } | null,
      /** ghost text 的完整范围（由 WritingEditor 的 useEffect 同步） */
      ghostRange: null as { from: number; to: number } | null,
    };
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

          this.storage.replaceData = null;
          this.storage.ghostRange = null;
          return true;
        },
      rejectGhost:
        () =>
        ({ state, view }: any) => {
          const rd = this.storage.replaceData;
          this.storage.replaceData = null;
          this.storage.ghostRange = null;

          // 扫描所有 ghost mark 文本
          const ranges: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node: any, pos: number) => {
            if (!node.isText) return;
            if (node.marks.some((m: any) => m.type.name === "ghostText")) {
              ranges.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          if (ranges.length === 0) return false;

          const { tr, schema } = state;

          // 从后往前删除所有 ghost 文本
          for (let i = ranges.length - 1; i >= 0; i--) {
            tr.delete(ranges[i].from, ranges[i].to);
          }

          // 用 schema.text() 恢复原文 — 纯文本节点，不拆段落
          if (rd?.originalText) {
            tr.insert(ranges[0].from, schema.text(rd.originalText));
          }

          view.dispatch(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const hasGhost = hasGhostMark(editor.state.doc);
        if (!hasGhost) return false;
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
        this.storage.replaceData = null;
        this.storage.ghostRange = null;
        return true;
      },
      Escape: ({ editor }) => {
        const hasGhost = hasGhostMark(editor.state.doc);
        if (!hasGhost) return false;
        return editor.commands.rejectGhost();
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
