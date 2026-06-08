import { useState, useMemo } from "react";
import type { TemplateMeta } from "../../../api/templates";

const GROUP_ORDER: { key: string; label: string; types?: string[]; category?: string }[] = [
  { key: "scene_beat", label: "Scene Beat Completions", types: ["beat_generate"] },
  { key: "summarization", label: "Scene Summarizations", types: ["scene_summarization"] },
  { key: "text_replacement", label: "Text Replacements", types: ["text_replacement"] },
  { key: "workshop_chat", label: "Workshop Chats", types: ["workshop_chat"] },
  { key: "analysis", label: "Analysis", types: ["analyze_chapter"] },
  { key: "gm", label: "GM", category: "gm" },
  { key: "components", label: "Prompt Components", category: "components" },
];

function groupTemplates(templates: TemplateMeta[]) {
  const grouped: { key: string; label: string; items: TemplateMeta[] }[] = [];
  const assigned = new Set<string>();

  for (const group of GROUP_ORDER) {
    const items = templates.filter((t) => {
      if (assigned.has(t.name)) return false;
      if (group.category) {
        return t.category === group.category || t.name.startsWith(group.category + "/");
      }
      if (group.types) {
        return group.types.includes(t.type);
      }
      return false;
    });
    for (const item of items) assigned.add(item.name);
    grouped.push({ key: group.key, label: group.label, items });
  }

  const remaining = templates.filter((t) => !assigned.has(t.name));
  if (remaining.length > 0) {
    grouped.push({ key: "other", label: "Other", items: remaining });
  }

  return grouped;
}

function typeBadge(userCreated?: boolean): { label: string; className: string } | null {
  if (userCreated) return null;
  return { label: "System", className: "bg-blue-500/15 text-blue-400" };
}

export function TemplateListSidebar({
  templates,
  selectedName,
  onSelect,
  onCreateNew,
  onCreateInGroup,
}: {
  templates: TemplateMeta[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  onCreateNew?: () => void;
  onCreateInGroup?: (groupKey: string) => void;
}) {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupTemplates(templates), [templates]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (t) =>
            (t.label || t.name).toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.type.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  return (
    <div className="w-[400px] flex-none border-r border-zinc-700/40 flex flex-col overflow-hidden bg-surface-panel">
      {/* Search + New toolbar */}
      <div className="flex-none flex items-center gap-1.5 px-2 py-2 border-b border-zinc-700/40">
        <div className="flex-1 flex items-center bg-zinc-800/40 border border-zinc-700/50 rounded text-[13px]">
          <input
            type="text"
            placeholder="Search library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent px-2.5 py-1.5 text-zinc-300 placeholder-zinc-500 outline-none text-[13px]"
          />
        </div>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="flex-none px-2.5 py-1.5 rounded text-[12px] font-semibold text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors cursor-pointer"
            type="button"
          >
            New
          </button>
        )}
      </div>

      {/* Grouped list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredGroups.map((group) => (
          <div key={group.key}>
            {/* Section header — NC style: label + count + add button */}
            <div className="sticky top-0 z-[1] flex items-center justify-between gap-1.5 px-3 py-1.5 bg-zinc-800 border-b border-zinc-700/30 text-[14px] text-zinc-300">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{group.label}</span>
                <span className="text-[12px] text-zinc-500 shrink-0">
                  {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              {onCreateInGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateInGroup(group.key); }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer shrink-0 px-1.5 py-0.5 rounded hover:bg-zinc-700/50"
                  type="button"
                >
                  + Add entry
                </button>
              )}
            </div>

            {/* List items */}
            {group.items.map((t) => {
              const badge = typeBadge(t.user_created);
              return (
                <button
                  key={t.name}
                  onClick={() => onSelect(t.name)}
                  className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedName === t.name
                      ? "bg-blue-500/8 text-blue-300"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                  }`}
                  type="button"
                  title={t.label || t.name}
                >
                  <span className="truncate flex-1">{t.label || t.name}</span>
                  {badge && (
                    <span
                      className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div className="px-3 py-8 text-center text-[13px] text-zinc-500">
            {search ? "No matching templates" : "No templates yet"}
          </div>
        )}
      </div>
    </div>
  );
}
