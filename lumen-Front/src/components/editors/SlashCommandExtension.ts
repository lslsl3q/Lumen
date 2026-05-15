/**
 * SlashCommandExtension — `/` 触发的浮动命令菜单
 *
 * 使用 @tiptap/suggestion 插件 + ReactRenderer 渲染 React 组件。
 * 命令定义在 slash-commands.tsx 中，按 category 分组渲染。
 */
import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { allCommands, type SlashCommandItem } from "./slash-commands";
import { SlashCommandPopup } from "./SlashCommandPopup";

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: { editor: any; range: any; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return allCommands.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.description?.toLowerCase().includes(q) ||
              item.searchTerms?.some((t) => t.toLowerCase().includes(q))
          );
        },
        render: () => {
          let reactRenderer: ReactRenderer | null = null;

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              reactRenderer = new ReactRenderer(SlashCommandPopup, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) => {
                    props.command(item);
                  },
                  clientRect: props.clientRect,
                },
                editor: props.editor,
              });
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              reactRenderer?.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) => {
                  props.command(item);
                },
                clientRect: props.clientRect,
              });
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                reactRenderer?.destroy();
                reactRenderer = null;
                return true;
              }
              return false;
            },
            onExit: () => {
              reactRenderer?.destroy();
              reactRenderer = null;
            },
          };
        },
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
});
