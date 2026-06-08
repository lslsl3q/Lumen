import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * CodeMirror 6 StreamLanguage for Jinja2 template syntax.
 *
 * Highlights: {% block tags %}, {{ variables }}, {# comments #}
 * Uses NC-aligned 4-color scheme: blue (vars), purple (keywords),
 * green (strings), gray (comments).
 */

interface Jinja2State {
  inBlock: boolean;
  inVar: boolean;
  inComment: boolean;
  str: string | null;
}

const KEYWORDS =
  /\b(?:if|else|elif|endif|for|in|endfor|include|set|with|block|endblock|macro|endmacro|import|from|as|not|and|or|True|False|None|true|false|none|is|defined|raw|endraw|do|extends|filter|endfilter|call|endcall|scope|endscope)\b/;

const jinja2Parser = StreamLanguage.define({
  name: "jinja2",

  startState(): Jinja2State {
    return { inBlock: false, inVar: false, inComment: false, str: null };
  },

  token(stream: any, state: Jinja2State): string | null {
    // ── Inside a quoted string within a tag ──
    if (state.str) {
      if (stream.match(state.str)) {
        state.str = null;
        return "string";
      }
      if (stream.peek() === "\\" && stream.pos + 1 < stream.string.length) {
        stream.next();
        stream.next();
        return "string";
      }
      stream.next();
      return "string";
    }

    // ── Inside {% ... %} ──
    if (state.inBlock) {
      if (stream.match(/-?%}/)) {
        state.inBlock = false;
        return "variableName";
      }
      if (stream.match(KEYWORDS)) return "keyword";
      if (stream.match(/^["']/)) {
        state.str = stream.current();
        return "string";
      }
      if (stream.match(/^\d+(\.\d+)?/)) return "number";
      if (stream.match(/^[a-zA-Z_]\w*(\.\w+)*/)) return "variableName";
      if (stream.match(/^(==|!=|<=|>=|<|>|\~=)/)) return "operator";
      if (stream.match(/^\|/)) return "operator";
      stream.next();
      return null;
    }

    // ── Inside {{ ... }} ──
    if (state.inVar) {
      if (stream.match(/-?}}/)) {
        state.inVar = false;
        return "variableName";
      }
      if (stream.match(/^["']/)) {
        state.str = stream.current();
        return "string";
      }
      if (stream.match(/^\d+(\.\d+)?/)) return "number";
      if (stream.match(/^[a-zA-Z_]\w*(\.\w+)*/)) return "variableName";
      if (stream.match(/^\|/)) return "operator";
      stream.next();
      return null;
    }

    // ── Inside {# ... #} ──
    if (state.inComment) {
      if (stream.match(/#}/)) {
        state.inComment = false;
        return "lineComment";
      }
      stream.skipToEnd();
      return "lineComment";
    }

    // ── Outside tags — look for opening delimiters ──
    if (stream.match(/\{%-?/)) {
      state.inBlock = true;
      return "variableName";
    }
    if (stream.match(/\{\{-?/)) {
      state.inVar = true;
      return "variableName";
    }
    if (stream.match(/\{#/)) {
      state.inComment = true;
      return "lineComment";
    }

    // Advance to next potential tag opening
    const rest = stream.string.slice(stream.pos);
    const idx = rest.search(/\{[{%#]/);
    if (idx > 0) stream.pos += idx;
    else if (idx === 0) stream.next();
    else stream.skipToEnd();
    return null;
  },

  blankLine() {},
});

/** NC-aligned Jinja2 highlight style: blue/purple/green/gray */
const jinja2Colors = HighlightStyle.define([
  { tag: tags.keyword, color: "#c678dd" },            // purple: if, endif, include
  { tag: tags.variableName, color: "#61afef" },        // blue: variables, brackets
  { tag: tags.string, color: "#98c379" },              // green: "strings"
  { tag: tags.lineComment, color: "#7d8799" },         // gray: {# comments #}
  { tag: tags.number, color: "#d19a66" },              // orange: 42, 3.14
  { tag: tags.operator, color: "#56b6c2" },             // cyan: |, ==, !=
]);

export function jinja2Extensions(): Extension[] {
  return [jinja2Parser, syntaxHighlighting(jinja2Colors)];
}
