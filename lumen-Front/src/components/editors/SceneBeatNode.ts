/**
 * SceneBeatNode — 场景节拍块（AI 微控制器）
 *
 * 内容以 HTML 存储，TipTap 的 parseHTML/renderHTML 自动处理序列化。
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SceneBeatView } from "./SceneBeatView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sceneBeat: {
      insertSceneBeat: (options?: {
        beatType?: "beat" | "continue";
        maxWords?: number;
      }) => ReturnType;
      toggleSceneBeatCollapsed: () => ReturnType;
      clearBeatContent: () => ReturnType;
    };
  }
}

export const SceneBeatNode = Node.create({
  name: "sceneBeat",
  group: "block",
  content: "inline*",
  defining: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      draggable: true,
    };
  },

  addAttributes() {
    return {
      beatType: {
        default: "beat",
        parseHTML: (el) => el.getAttribute("data-beat-type") ?? "beat",
        renderHTML: (attrs) => ({ "data-beat-type": attrs.beatType }),
      },
      status: {
        default: "idle",
        parseHTML: (el) => el.getAttribute("data-status") ?? "idle",
        renderHTML: (attrs) => ({ "data-status": attrs.status }),
      },
      maxWords: {
        default: 400,
        parseHTML: (el) => parseInt(el.getAttribute("data-max-words") ?? "400", 10),
        renderHTML: (attrs) => ({ "data-max-words": attrs.maxWords }),
      },
      modelId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-model") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.modelId) return {};
          return { "data-model": attrs.modelId };
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
      contextIds: {
        default: [],
        parseHTML: (el) => JSON.parse(el.getAttribute("data-context-ids") ?? "[]"),
        renderHTML: (attrs) => {
          if (!attrs.contextIds?.length) return {};
          return { "data-context-ids": JSON.stringify(attrs.contextIds) };
        },
      },
      contextSelection: {
        default: {},
        parseHTML: (el) => {
          const raw = el.getAttribute("data-context-selection");
          if (raw) {
            try { return JSON.parse(raw); } catch { return {}; }
          }
          // migrate legacy contextIds → contextSelection.codexEntries
          const legacyIds = JSON.parse(el.getAttribute("data-context-ids") ?? "[]");
          if (legacyIds.length) return { codexEntries: legacyIds };
          return {};
        },
        renderHTML: (attrs) => {
          const sel = attrs.contextSelection;
          if (!sel || Object.keys(sel).length === 0) return {};
          return { "data-context-selection": JSON.stringify(sel) };
        },
      },
      excludeFromExport: {
        default: true,
        parseHTML: () => true,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scene-beat"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "scene-beat",
        class: "scene-beat-block",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SceneBeatView);
  },

  addCommands() {
    return {
      insertSceneBeat:
        (options = {}) =>
        ({ commands, state }) => {
          const nodeType = state.schema.nodes.sceneBeat;
          if (!nodeType) {
            console.error("[SceneBeatNode] sceneBeat node type not found in schema!");
            return false;
          }
          return commands.insertContent({
            type: "sceneBeat",
            attrs: {
              beatType: options.beatType ?? "beat",
              maxWords: options.maxWords ?? 400,
            },
          });
        },
      toggleSceneBeatCollapsed:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== this.name) continue;
            if (dispatch) {
              dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, {
                ...node.attrs,
                collapsed: !node.attrs.collapsed,
              }));
            }
            return true;
          }
          return false;
        },
      clearBeatContent:
        () =>
        ({ state, dispatch }) => {
          // 找到当前 beat 节点，删除它到下一个 beat/文档末尾之间的所有节点
          const { $from } = state.selection;
          const pos = $from.after(1);

          let beatEnd = state.doc.content.size;
          let found = false;

          state.doc.descendants((node, offset) => {
            if (found) return false;
            if (offset > pos && node.type.name === "sceneBeat") {
              beatEnd = offset;
              found = true;
              return false;
            }
          });

          if (dispatch) {
            const tr = state.tr.delete(pos, beatEnd);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
