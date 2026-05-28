import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { CodexEntry } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";

export const codexPluginKey = new PluginKey("codexHighlight");

let termsVersion = 0;
let cachedTerms: { text: string; entryId: string }[] = [];

export function invalidateCodexTerms() { termsVersion++; }

function buildTerms(entries: CodexEntry[]) {
  const terms: { text: string; entryId: string }[] = [];
  for (const entry of entries) {
    if (entry.name.length >= 2) {
      terms.push({ text: entry.name, entryId: entry.id });
    }
    for (const alias of (entry.aliases || [])) {
      if (alias.length >= 2) {
        terms.push({ text: alias, entryId: entry.id });
      }
    }
  }
  terms.sort((a, b) => b.text.length - a.text.length);
  return terms;
}

let lastVersion = -1;

function getTerms(): { text: string; entryId: string }[] {
  if (termsVersion !== lastVersion) {
    lastVersion = termsVersion;
    cachedTerms = buildTerms(useWritingStore.getState().codexEntries);
  }
  return cachedTerms;
}

interface Match {
  from: number;
  to: number;
  entryId: string;
}

function findCodexMatches(doc: any): Match[] {
  const terms = getTerms();
  if (!terms.length) return [];

  const matches: Match[] = [];
  const usedRanges: { from: number; to: number }[] = [];

  doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    const lower = text.toLowerCase();

    for (const term of terms) {
      const termLower = term.text.toLowerCase();
      let searchFrom = 0;
      while (true) {
        const idx = lower.indexOf(termLower, searchFrom);
        if (idx === -1) break;
        searchFrom = idx + 1;

        const from = pos + idx;
        const to = from + term.text.length;

        const overlaps = usedRanges.some(
          (r) => (from >= r.from && from < r.to) || (to > r.from && to <= r.to)
        );
        if (!overlaps) {
          matches.push({ from, to, entryId: term.entryId });
          usedRanges.push({ from, to });
        }
      }
    }
  });

  return matches;
}

export const CodexHighlightExtension = Extension.create({
  name: "codexHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: codexPluginKey,
        props: {
          decorations(state) {
            if (!cachedTerms.length && !useWritingStore.getState().codexEntries?.length) {
              return DecorationSet.empty;
            }

            const { doc } = state;
            const matches = findCodexMatches(doc);
            if (!matches.length) return DecorationSet.empty;

            const decorations = matches.map((m) =>
              Decoration.inline(m.from, m.to, {
                class: "codex-hl",
                "data-codex-entry-id": m.entryId,
              })
            );
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
