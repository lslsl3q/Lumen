/**
 * SlashCommandExtension — `/` 触发的浮动命令菜单
 *
 * 使用 @tiptap/suggestion 插件 + ReactRenderer 渲染 React 组件。
 * 额外监听 selectionUpdate：光标移回 `/` 后面时自动重新显示弹窗。
 */
import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { allCommands, type SlashCommandItem } from "./slash-commands";
import { SlashCommandPopup } from "./SlashCommandPopup";

function filterItems(query: string): SlashCommandItem[] {
  const q = query.toLowerCase();
  return allCommands.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.searchTerms?.some((t) => t.toLowerCase().includes(q))
  );
}

// ── 弹窗生命周期（模块级，render 闭包和 selectionUpdate 共享） ──

let renderer: ReactRenderer | null = null;

function showPopup(
  editor: any,
  items: SlashCommandItem[],
  clientRect: (() => DOMRect | null) | null | undefined,
  onCommand: (item: SlashCommandItem) => void,
) {
  if (renderer) {
    renderer.updateProps({ items, command: onCommand, clientRect });
  } else {
    renderer = new ReactRenderer(SlashCommandPopup, {
      props: { items, command: onCommand, clientRect },
      editor,
    });
  }
}

function destroyPopup() {
  renderer?.destroy();
  renderer = null;
}

// ── Extension ──

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  onCreate() {
    // 全局点击监听：点击编辑器和弹窗以外的任何地方都关闭弹窗
    const editorEl = this.editor.view.dom as HTMLElement;
    const handleGlobalClick = (e: MouseEvent) => {
      if (!renderer) return;
      const target = e.target as HTMLElement;
      // 点击在编辑器内 → 不处理
      if (editorEl.contains(target)) return;
      // 点击在实际弹窗内（createPortal 渲染到 body，不在 renderer.element 里）→ 不处理
      const actualPopup = document.querySelector(".slash-command-popup");
      if (actualPopup?.contains(target)) return;
      destroyPopup();
    };
    document.addEventListener("mousedown", handleGlobalClick);
    this.storage.removeGlobalClick = () => {
      document.removeEventListener("mousedown", handleGlobalClick);
    };

    const handleSelectionUpdate = ({ editor }: { editor: any }) => {
      // suggestion 插件正在管理弹窗时不干预
      if (renderer) return;

      const { from } = editor.state.selection;
      if (from < 1) return;

      // 光标是否在 / 后面
      const charBefore = editor.state.doc.textBetween(from - 1, from);
      if (charBefore !== "/") return;

      // 找 query 文本（/ 到下一个空格/换行）
      let queryEnd = from;
      const maxPos = Math.min(editor.state.doc.content.size, from + 50);
      for (let i = from; i < maxPos; i++) {
        try {
          const ch = editor.state.doc.textBetween(i, i + 1);
          if (ch === " " || ch === "\n" || ch === "") break;
          queryEnd = i + 1;
        } catch { break; }
      }

      const query = from < queryEnd ? editor.state.doc.textBetween(from, queryEnd) : "";
      const items = filterItems(query);

      const clientRect = () => {
        try {
          const coords = editor.view.coordsAtPos(from);
          return {
            left: coords.left, right: coords.left,
            top: coords.top, bottom: coords.top + 20,
            width: 0, height: 20,
            x: coords.left, y: coords.top,
            toJSON: () => ({}),
          } as DOMRect;
        } catch { return null; }
      };

      showPopup(editor, items, clientRect, (item: SlashCommandItem) => {
        item.command({ editor, range: { from: from - 1, to: queryEnd } });
        destroyPopup();
      });
    };
    this.editor.on("selectionUpdate", handleSelectionUpdate);
    this.storage.removeSelectionUpdate = () => {
      this.editor.off("selectionUpdate", handleSelectionUpdate);
    };
  },

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: { editor: any; range: any; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => filterItems(query),
        render: () => ({
          onStart: (props: SuggestionProps<SlashCommandItem>) => {
            showPopup(props.editor, props.items, props.clientRect, (item) => {
              props.command(item);
              destroyPopup();
            });
          },
          onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
            showPopup(props.editor, props.items, props.clientRect, (item) => {
              props.command(item);
              destroyPopup();
            });
          },
          onExit: () => destroyPopup(),
          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === "Escape") { destroyPopup(); return true; }
            return false;
          },
        }),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },

  onDestroy() {
    this.storage.removeGlobalClick?.();
    this.storage.removeSelectionUpdate?.();
  },
});
