/**
 * FocusMode Extension — 专注模式
 *
 * 当前光标所在的**顶层块节点**高亮，其余块变暗。
 * 通过 ProseMirror Decoration 给当前节点加 `.fm-active` 类，
 * 其余节点通过 CSS `.focus-mode > :not(.fm-active)` 变暗。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    focusMode: {
      toggleFocusMode: () => ReturnType;
    };
  }
}

const focusPluginKey = new PluginKey("focusMode");

export const FocusModeExtension = Extension.create({
  name: "focusMode",

  addStorage() {
    return {
      enabled: false as boolean,
    };
  },

  addCommands() {
    return {
      toggleFocusMode:
        () =>
        ({ editor }) => {
          const storage = (editor.storage as any).focusMode;
          storage.enabled = !storage.enabled;
          const el = editor.view.dom as HTMLElement;
          el.classList.toggle("focus-mode", storage.enabled);
          // Force a transaction so decorations recalculate
          const { tr } = editor.state;
          tr.setMeta(focusPluginKey, { toggled: true });
          editor.view.dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: focusPluginKey,
        props: {
          decorations(state) {
            if (!(editor.storage as any).focusMode?.enabled) return DecorationSet.empty;

            const { doc, selection } = state;
            const { $from } = selection;

            // Walk up to the top-level block node (depth 1)
            let d = $from.depth;
            while (d > 1) d--;
            const blockFrom = $from.start(d);
            const blockTo = $from.end(d);

            // Clamp to valid Decoration.node range
            const nodeStart = Math.max(0, blockFrom - 1);
            const nodeEnd = Math.min(doc.content.size, blockTo + 1);

            // Verify the range covers an actual node
            const node = doc.nodeAt(Math.max(0, blockFrom - 1));
            if (!node) return DecorationSet.empty;

            const decoration = Decoration.node(nodeStart, nodeEnd, {
              class: "fm-active",
            });

            return DecorationSet.create(doc, [decoration]);
          },
        },
      }),
    ];
  },
});
