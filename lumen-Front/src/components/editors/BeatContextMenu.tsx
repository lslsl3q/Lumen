/**
 * BeatContextMenu — NC-aligned context selection using shadcn DropdownMenu
 *
 * NC visual spec (measured from Chrome DevTools):
 *   Container: bg #18181b, border-radius 8px, min-width 224px, no padding
 *   Items: text 14px #d6d3d1, inner padding px-3 py-1.5 gap-3
 *   Group label: 12px font-semibold tracking-wide #a8a29e
 *   Dot indicator when submenu has checked items
 *   Disabled items: opacity-50
 */
import { useMemo, useCallback } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingChapter, WritingScene } from "../../api/writing";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "../ui/dropdown-menu";

// ── Types ──

export interface ContextSelection {
  fullNovelText?: boolean;
  fullOutline?: boolean;
  acts?: string[];
  chapters?: string[];
  scenes?: string[];
  snippets?: string[];
  codexEntries?: string[];
  codexTypes?: string[];
  codexCategories?: string[];
  codexTags?: string[];
  plotEnabled?: boolean;
  plotArcs?: string[];
  plotLines?: string[];
}

// ── Helpers ──

function hasContent(str: string | undefined | null): boolean {
  return !!str && str.trim().length > 0;
}

/** NC-aligned dark theme classes */
const menuContentCls = "!bg-surface-deep !text-text-primary !border-border-default !rounded-md !p-0 shadow-[0_0_0_1px_#3f3f46,0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)]";
const subContentCls = "!bg-surface-deep !text-text-primary !border-border-default !rounded-md !p-0";
const separatorCls = "!bg-surface-elevated";
const itemCls = "!px-4 !py-1.5 !text-[14px] !gap-3";
const groupLabelCls = "!text-xs tracking-wide font-semibold !text-text-secondary !px-3 !py-1";

// ── Dot Indicator ──

function DotIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <svg className="flex-none text-text-dim size-2.5" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true">
      <circle cx="160" cy="256" r="100" />
    </svg>
  );
}

// ── Main Component ──

export function BeatContextMenu({
  selection,
  onChange,
  children,
}: {
  selection: ContextSelection;
  onChange: (sel: ContextSelection) => void;
  children: React.ReactNode;
}) {
  const acts = useWritingStore(s => s.acts);
  const codexEntries = useWritingStore(s => s.codexEntries ?? []);
  const snippets = useWritingStore(s => s.snippets ?? []);
  const activeProjectId = useWritingStore(s => s.activeProjectId);
  const plotTree = useWritingStore(s => s.plotTree);

  const allChapters = useMemo(() => {
    const result: (WritingChapter & { actTitle: string; actId: string })[] = [];
    for (const act of acts) {
      const actTitle = act.title || `Act ${(act.sort_order ?? 0) + 1}`;
      for (const ch of act.chapters) {
        result.push({ ...ch, actTitle, actId: act.id });
      }
    }
    return result;
  }, [acts]);

  const allScenes = useMemo(() => {
    const result: (WritingScene & { chapterTitle: string; chapterId: string })[] = [];
    for (const act of acts) {
      for (const ch of act.chapters) {
        const chTitle = ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`;
        for (const sc of ch.scenes) {
          result.push({ ...sc, chapterTitle: chTitle, chapterId: ch.id });
        }
      }
    }
    return result;
  }, [acts]);

  const codexTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of codexEntries) {
      if (entry.type) types.add(entry.type);
    }
    return Array.from(types);
  }, [codexEntries]);

  const codexCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const entry of codexEntries) {
      if (entry.category) cats.add(entry.category);
    }
    return Array.from(cats);
  }, [codexEntries]);

  const codexTags = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of codexEntries) {
      for (const tag of entry.tags || []) {
        if (tag) tags.add(tag);
      }
    }
    return Array.from(tags);
  }, [codexEntries]);

  // Dot indicator helpers
  const hasActSel = (selection.acts?.length ?? 0) > 0;
  const hasChSel = (selection.chapters?.length ?? 0) > 0;
  const hasScSel = (selection.scenes?.length ?? 0) > 0;
  const hasSnSel = (selection.snippets?.length ?? 0) > 0;
  const hasCeSel = (selection.codexEntries?.length ?? 0) > 0;
  const hasCtSel = (selection.codexTypes?.length ?? 0) > 0;
  const hasCcSel = (selection.codexCategories?.length ?? 0) > 0;
  const hasCgSel = (selection.codexTags?.length ?? 0) > 0;
  const hasPlotArcSel = (selection.plotArcs?.length ?? 0) > 0;
  const hasPlotLineSel = (selection.plotLines?.length ?? 0) > 0;
  const plotArcs = plotTree?.arcs || [];
  const selectedArcIds = new Set(selection.plotArcs || []);
  const plotLines = (selectedArcIds.size > 0
    ? plotArcs.filter(a => selectedArcIds.has(a.id))
    : plotArcs
  ).flatMap(a => a.lines || []);

  const toggle = useCallback(<K extends keyof ContextSelection>(key: K, id: string) => {
    const arr = (selection[key] as string[]) || [];
    const next = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    onChange({ ...selection, [key]: next });
  }, [selection, onChange]);

  const setBool = useCallback(<K extends keyof ContextSelection>(key: K, value: boolean) => {
    onChange({ ...selection, [key]: value || undefined });
  }, [selection, onChange]);

  const clearAll = useCallback(() => { onChange({}); }, [onChange]);

  const hasSelection = Object.values(selection).some(v =>
    typeof v === "boolean" ? v : Array.isArray(v) && v.length > 0
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>

      <DropdownMenuContent className={`min-w-[224px] p-0 ${menuContentCls}`}>
        {/* ── Group 1: Toggles ── */}
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={selection.fullNovelText ?? false}
            onCheckedChange={(v) => setBool("fullNovelText", !!v)}
            closeParentOnClick={false}
            disabled={!hasContent(activeProjectId)}
            className={itemCls}
          >全部手稿</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selection.fullOutline ?? false}
            onCheckedChange={(v) => setBool("fullOutline", !!v)}
            closeParentOnClick={false}
            disabled={!hasContent(activeProjectId)}
            className={itemCls}
          >全部大纲</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className={separatorCls} />

        {/* ── Group 2: Structural ── */}
        <DropdownMenuGroup>
          {acts.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={itemCls}>
                <DotIndicator visible={hasActSel} />卷
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`min-w-[200px] p-0 ${subContentCls}`}>
                {acts.map(a => (
                  <DropdownMenuCheckboxItem
                    key={a.id}
                    checked={(selection.acts || []).includes(a.id)}
                    onCheckedChange={() => toggle("acts", a.id)}
                    closeParentOnClick={false}
                    className={itemCls}
                  >{a.title || `Act ${(a.sort_order ?? 0) + 1}`}</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {allChapters.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={itemCls}>
                <DotIndicator visible={hasChSel} />章节
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`min-w-[220px] p-0 ${subContentCls}`}>
                {acts.filter(a => (a.chapters || []).length > 0).map((act, gi, filtered) => (
                  <DropdownMenuGroup key={act.id}>
                    {filtered.length > 1 && (
                      <DropdownMenuLabel className={groupLabelCls}>
                        {act.title || `Act ${(act.sort_order ?? 0) + 1}`}
                      </DropdownMenuLabel>
                    )}
                    {act.chapters.map(ch => (
                      <DropdownMenuCheckboxItem
                        key={ch.id}
                        checked={(selection.chapters || []).includes(ch.id)}
                        onCheckedChange={() => toggle("chapters", ch.id)}
                        closeParentOnClick={false}
                        className={itemCls}
                      >{ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`}</DropdownMenuCheckboxItem>
                    ))}
                    {gi < filtered.length - 1 && <DropdownMenuSeparator className={separatorCls} />}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {allScenes.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={itemCls}>
                <DotIndicator visible={hasScSel} />场景
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`min-w-[240px] max-h-[360px] p-0 ${subContentCls}`}>
                {allScenes.reduce<{ chapterId: string; chapterTitle: string; scenes: WritingScene[] }[]>((groups, sc) => {
                  let group = groups.find(g => g.chapterId === sc.chapterId);
                  if (!group) {
                    group = { chapterId: sc.chapterId, chapterTitle: sc.chapterTitle, scenes: [] };
                    groups.push(group);
                  }
                  group.scenes.push(sc);
                  return groups;
                }, []).map((group, gi, arr) => (
                  <DropdownMenuGroup key={group.chapterId}>
                    {arr.length > 1 && (
                      <DropdownMenuLabel className={groupLabelCls}>{group.chapterTitle}</DropdownMenuLabel>
                    )}
                    {group.scenes.map(sc => (
                      <DropdownMenuCheckboxItem
                        key={sc.id}
                        checked={(selection.scenes || []).includes(sc.id)}
                        onCheckedChange={() => toggle("scenes", sc.id)}
                        closeParentOnClick={false}
                        className={itemCls}
                      >{sc.subtitle || sc.summary?.slice(0, 30) || `Scene`}</DropdownMenuCheckboxItem>
                    ))}
                    {gi < arr.length - 1 && <DropdownMenuSeparator className={separatorCls} />}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {snippets.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={itemCls}>
                <DotIndicator visible={hasSnSel} />片段
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`min-w-[220px] p-0 ${subContentCls}`}>
                {snippets.map(sn => (
                  <DropdownMenuCheckboxItem
                    key={sn.id}
                    checked={(selection.snippets || []).includes(sn.id)}
                    onCheckedChange={() => toggle("snippets", sn.id)}
                    closeParentOnClick={false}
                    className={itemCls}
                  >{sn.name || "Untitled Snippet"}</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator className={separatorCls} />

        {/* ── Group 3: Codex ── */}
        <DropdownMenuGroup>
          {codexEntries.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={itemCls}>
                <DotIndicator visible={hasCeSel} />法典条目
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`min-w-[220px] p-0 ${subContentCls}`}>
                {codexEntries.map(e => (
                  <DropdownMenuCheckboxItem
                    key={e.id}
                    checked={(selection.codexEntries || []).includes(e.id)}
                    onCheckedChange={() => toggle("codexEntries", e.id)}
                    closeParentOnClick={false}
                    className={itemCls}
                  >
                    {e.name || "(未命名)"}
                    <span className="ml-auto text-xs text-text-dim">{e.type}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={codexTypes.length === 0} className={itemCls}>
              <DotIndicator visible={hasCtSel} />按类型选择
            </DropdownMenuSubTrigger>
            {codexTypes.length > 0 && (
              <DropdownMenuSubContent className={`min-w-[200px] p-0 ${subContentCls}`}>
                {codexTypes.map(t => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={(selection.codexTypes || []).includes(t)}
                    onCheckedChange={() => toggle("codexTypes", t)}
                    closeParentOnClick={false}
                    className={itemCls}
                  >
                    {t}
                    <span className="ml-auto text-xs text-text-dim">{codexEntries.filter(e => e.type === t).length}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            )}
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={codexCategories.length === 0} className={itemCls}>
              <DotIndicator visible={hasCcSel} />按分类选择
            </DropdownMenuSubTrigger>
            {codexCategories.length > 0 && (
              <DropdownMenuSubContent className={`min-w-[200px] p-0 ${subContentCls}`}>
                {codexCategories.map(cat => (
                  <DropdownMenuCheckboxItem
                    key={cat}
                    checked={(selection.codexCategories || []).includes(cat)}
                    onCheckedChange={() => toggle("codexCategories", cat)}
                    closeParentOnClick={false}
                    className={itemCls}
                  >
                    {cat}
                    <span className="ml-auto text-xs text-text-dim">{codexEntries.filter(e => e.category === cat).length}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            )}
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={codexTags.length === 0} className={itemCls}>
              <DotIndicator visible={hasCgSel} />按标签选择
            </DropdownMenuSubTrigger>
            {codexTags.length > 0 && (
              <DropdownMenuSubContent className={`min-w-[200px] p-0 ${subContentCls}`}>
                {codexTags.map(t => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={(selection.codexTags || []).includes(t)}
                    onCheckedChange={() => toggle("codexTags", t)}
                    closeParentOnClick={false}
                    className={itemCls}
                  >
                    {t}
                    <span className="ml-auto text-xs text-text-dim">{codexEntries.filter(e => e.tags?.includes(t)).length}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            )}
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {plotArcs.length > 0 && (
          <>
            <DropdownMenuSeparator className={separatorCls} />

            {/* ── Group 4: Plot ── */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className={groupLabelCls}>Plot</DropdownMenuLabel>

              <DropdownMenuCheckboxItem
                checked={selection.plotEnabled ?? false}
                onCheckedChange={(v) => setBool("plotEnabled", !!v)}
                closeParentOnClick={false}
                className={itemCls}
              >注入剧情结构</DropdownMenuCheckboxItem>

              {selection.plotEnabled && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={itemCls}>
                      <DotIndicator visible={hasPlotArcSel} />Arcs
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={`min-w-[220px] p-0 ${subContentCls}`}>
                      {plotArcs.map(arc => (
                        <DropdownMenuCheckboxItem
                          key={arc.id}
                          checked={(selection.plotArcs || []).includes(arc.id)}
                          onCheckedChange={() => toggle("plotArcs", arc.id)}
                          closeParentOnClick={false}
                          className={itemCls}
                        >{arc.title || `Arc ${(arc.sort_order ?? 0) + 1}`}</DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={itemCls}>
                      <DotIndicator visible={hasPlotLineSel} />Lines
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={`min-w-[220px] p-0 ${subContentCls}`}>
                      {plotLines.map(line => (
                        <DropdownMenuCheckboxItem
                          key={line.id}
                          checked={(selection.plotLines || []).includes(line.id)}
                          onCheckedChange={() => toggle("plotLines", line.id)}
                          closeParentOnClick={false}
                          className={itemCls}
                        >
                          {line.title || line.name || "未命名线"}
                          <span className="ml-auto text-[10px] text-text-dim">{line.type}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuGroup>
          </>
        )}

        {hasSelection && (
          <>
            <DropdownMenuSeparator className={separatorCls} />
            <DropdownMenuItem onClick={clearAll} className={`${itemCls} opacity-50`}>清除选择</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Tags display ──

export function ContextSelectionTags({
  selection,
  onRemove,
}: {
  selection: ContextSelection;
  onRemove: (key: keyof ContextSelection, id?: string) => void;
}) {
  const acts = useWritingStore(s => s.acts);
  const codexEntries = useWritingStore(s => s.codexEntries ?? []);
  const snippets = useWritingStore(s => s.snippets ?? []);
  const allChapters = useMemo(() => {
    const result: (WritingChapter & { actTitle: string })[] = [];
    for (const act of acts) {
      const actTitle = act.title || `Act ${(act.sort_order ?? 0) + 1}`;
      for (const ch of act.chapters) {
        result.push({ ...ch, actTitle });
      }
    }
    return result;
  }, [acts]);
  const allScenes = useMemo(() => {
    const result: (WritingScene & { chapterTitle: string })[] = [];
    for (const act of acts) {
      for (const ch of act.chapters) {
        const chTitle = ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`;
        for (const sc of ch.scenes) {
          result.push({ ...sc, chapterTitle: chTitle });
        }
      }
    }
    return result;
  }, [acts]);

  const tags: { key: string; id: string; label: string }[] = [];

  if (selection.fullNovelText) tags.push({ key: "fullNovelText", id: "", label: "全部手稿" });
  if (selection.fullOutline) tags.push({ key: "fullOutline", id: "", label: "全部大纲" });
  for (const id of selection.acts || []) {
    const act = acts.find(a => a.id === id);
    if (act) tags.push({ key: "acts", id, label: act.title || `Act ${(act.sort_order ?? 0) + 1}` });
  }
  for (const id of selection.chapters || []) {
    const ch = allChapters.find(c => c.id === id);
    if (ch) tags.push({ key: "chapters", id, label: ch.title || `Ch ${(ch.sort_order ?? 0) + 1}` });
  }
  for (const id of selection.scenes || []) {
    const sc = allScenes.find(s => s.id === id);
    if (sc) tags.push({ key: "scenes", id, label: sc.subtitle || sc.summary || `Scene` });
  }
  for (const id of selection.snippets || []) {
    const sn = snippets.find(s => s.id === id);
    if (sn) tags.push({ key: "snippets", id, label: sn.name || "Snippet" });
  }
  for (const id of selection.codexEntries || []) {
    const entry = codexEntries.find(e => e.id === id);
    if (entry) tags.push({ key: "codexEntries", id, label: entry.name || "Entry" });
  }
  for (const typeName of selection.codexTypes || []) {
    tags.push({ key: "codexTypes", id: typeName, label: `类型: ${typeName}` });
  }
  for (const catName of selection.codexCategories || []) {
    tags.push({ key: "codexCategories", id: catName, label: `分类: ${catName}` });
  }
  for (const tagName of selection.codexTags || []) {
    tags.push({ key: "codexTags", id: tagName, label: `标签: ${tagName}` });
  }

  if (tags.length === 0) return null;

  return (
    <div className="beat-ctx-tags">
      {tags.map(tag => (
        <span key={`${tag.key}-${tag.id}`} className="beat-ctx-tag">
          {tag.label}
          <button onClick={e => { e.stopPropagation(); onRemove(tag.key as keyof ContextSelection, tag.id); }} type="button">×</button>
        </span>
      ))}
    </div>
  );
}
