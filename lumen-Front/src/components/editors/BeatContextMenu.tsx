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
import { useMemo, useCallback, Children, type ReactElement } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { WritingChapter, WritingScene, ManuscriptChapter } from "../../api/writing";
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

/**
 * 从 TipTap JSON 字符串或纯文本中提取可显示的文本
 * TipTap JSON 格式：{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}
 */
function extractTextFromTipTap(jsonStr: string | undefined | null): string {
  if (!jsonStr) return "";
  // 先尝试作为 JSON 解析
  if (jsonStr.trim().startsWith("{")) {
    try {
      const doc = JSON.parse(jsonStr);
      const texts: string[] = [];
      const walk = (node: any) => {
        if (node.text) texts.push(node.text);
        if (node.content) node.content.forEach(walk);
      };
      walk(doc);
      return texts.join("").trim();
    } catch {
      // JSON 解析失败，返回原字符串
    }
  }
  return jsonStr.trim();
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
    const result: (WritingScene & { chapterTitle: string; chapterId: string; chapterNumber: number })[] = [];
    for (const act of acts) {
      for (const ch of act.chapters) {
        const chapterNumber = (ch.sort_order ?? 0) + 1;
        const chTitle = ch.title ? `第${chapterNumber}章: ${ch.title}` : `第${chapterNumber}章`;
        for (const sc of ch.scenes) {
          result.push({ ...sc, chapterTitle: chTitle, chapterId: ch.id, chapterNumber });
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

  const toggleAll = useCallback(<K extends keyof ContextSelection>(key: K, allIds: string[]) => {
    const current = (selection[key] as string[]) || [];
    // 如果已全选，则清空；否则全选
    const isAllSelected = allIds.length > 0 && allIds.every(id => current.includes(id));
    const next = isAllSelected ? [] : [...allIds];
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
      <DropdownMenuTrigger render={Children.only(children) as ReactElement} />

      <DropdownMenuContent className={`min-w-[224px] p-0 ${menuContentCls}`}>
        {/* ── Group 1: Toggles ── */}
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={selection.fullNovelText ?? false}
            onCheckedChange={(v) => setBool("fullNovelText", !!v)}
            closeOnClick={false}
            disabled={!hasContent(activeProjectId)}
            className={itemCls}
          >全部手稿</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selection.fullOutline ?? false}
            onCheckedChange={(v) => setBool("fullOutline", !!v)}
            closeOnClick={false}
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
                    closeOnClick={false}
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
                    {act.chapters.map(ch => {
                      const chapterNumber = (ch.sort_order ?? 0) + 1;
                      const displayTitle = ch.title ? `第${chapterNumber}章: ${ch.title}` : `第${chapterNumber}章`;
                      return (
                        <DropdownMenuCheckboxItem
                          key={ch.id}
                          checked={(selection.chapters || []).includes(ch.id)}
                          onCheckedChange={() => toggle("chapters", ch.id)}
                          closeOnClick={false}
                          className={itemCls}
                        >{displayTitle}</DropdownMenuCheckboxItem>
                      );
                    })}
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
                {allScenes.reduce<{ chapterId: string; chapterTitle: string; chapterNumber: number; scenes: WritingScene[] }[]>((groups, sc) => {
                  let group = groups.find(g => g.chapterId === sc.chapterId);
                  if (!group) {
                    group = { chapterId: sc.chapterId, chapterTitle: sc.chapterTitle, chapterNumber: sc.chapterNumber, scenes: [] };
                    groups.push(group);
                  }
                  group.scenes.push(sc);
                  return groups;
                }, []).map((group, gi, arr) => (
                  <DropdownMenuGroup key={group.chapterId}>
                    {arr.length > 1 && (
                      <DropdownMenuLabel className={groupLabelCls}>{group.chapterTitle}</DropdownMenuLabel>
                    )}
                    {group.scenes.map(sc => {
                      const displayText = extractTextFromTipTap(sc.subtitle) || extractTextFromTipTap(sc.summary)?.slice(0, 30) || `Scene`;
                      return (
                        <DropdownMenuCheckboxItem
                          key={sc.id}
                          checked={(selection.scenes || []).includes(sc.id)}
                          onCheckedChange={() => toggle("scenes", sc.id)}
                          closeOnClick={false}
                          className={itemCls}
                        >{displayText}</DropdownMenuCheckboxItem>
                      );
                    })}
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
                    closeOnClick={false}
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
                    closeOnClick={false}
                    className={itemCls}
                  >
                    {e.name || "(未命名)"}
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
                <DropdownMenuCheckboxItem
                  key="__all-types__"
                  checked={codexTypes.length > 0 && codexTypes.every(t => (selection.codexTypes || []).includes(t))}
                  onCheckedChange={() => toggleAll("codexTypes", codexTypes)}
                  closeOnClick={false}
                  className={itemCls}
                >所有类型</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator className={separatorCls} />
                {codexTypes.map(t => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={(selection.codexTypes || []).includes(t)}
                    onCheckedChange={() => toggle("codexTypes", t)}
                    closeOnClick={false}
                    className={itemCls}
                  >
                    {t}
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
                <DropdownMenuCheckboxItem
                  key="__all-categories__"
                  checked={codexCategories.length > 0 && codexCategories.every(cat => (selection.codexCategories || []).includes(cat))}
                  onCheckedChange={() => toggleAll("codexCategories", codexCategories)}
                  closeOnClick={false}
                  className={itemCls}
                >所有分类</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator className={separatorCls} />
                {codexCategories.map(cat => (
                  <DropdownMenuCheckboxItem
                    key={cat}
                    checked={(selection.codexCategories || []).includes(cat)}
                    onCheckedChange={() => toggle("codexCategories", cat)}
                    closeOnClick={false}
                    className={itemCls}
                  >
                    {cat}
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
                <DropdownMenuCheckboxItem
                  key="__all-tags__"
                  checked={codexTags.length > 0 && codexTags.every(t => (selection.codexTags || []).includes(t))}
                  onCheckedChange={() => toggleAll("codexTags", codexTags)}
                  closeOnClick={false}
                  className={itemCls}
                >所有标签</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator className={separatorCls} />
                {codexTags.map(t => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={(selection.codexTags || []).includes(t)}
                    onCheckedChange={() => toggle("codexTags", t)}
                    closeOnClick={false}
                    className={itemCls}
                  >
                    {t}
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
                closeOnClick={false}
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
                          closeOnClick={false}
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
                          closeOnClick={false}
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

interface BadgeItem {
  key: string;
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

export function typeIcon(type: string) {
  switch (type) {
    case "fullNovelText":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "fullOutline":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    case "acts":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /></svg>;
    case "chapters":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M8 7h8" /><path d="M8 11h6" /></svg>;
    case "scenes":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "snippets":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case "codexEntries":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
    case "codexTypes":
    case "codexCategories":
    case "codexTags":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
    default:
      return null;
  }
}

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
    const result: (ManuscriptChapter & { actTitle: string })[] = [];
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

  const badges: BadgeItem[] = [];

  if (selection.fullNovelText) badges.push({ key: "fullNovelText", id: "", type: "fullNovelText", title: "全部手稿" });
  if (selection.fullOutline) badges.push({ key: "fullOutline", id: "", type: "fullOutline", title: "全部大纲" });
  for (const id of selection.acts || []) {
    const act = acts.find(a => a.id === id);
    if (act) {
      const chCount = act.chapters?.length ?? 0;
      badges.push({ key: "acts", id, type: "acts", title: act.title || `Act ${(act.sort_order ?? 0) + 1}`, subtitle: `${chCount} 章节` });
    }
  }
  for (const id of selection.chapters || []) {
    const ch = allChapters.find(c => c.id === id);
    if (ch) {
      const scCount = ch.scenes?.length ?? 0;
      const chapterNumber = (ch.sort_order ?? 0) + 1;
      const title = ch.title ? `第${chapterNumber}章: ${ch.title}` : `第${chapterNumber}章`;
      badges.push({ key: "chapters", id, type: "chapters", title, subtitle: `${scCount} 场景` });
    }
  }
  for (const id of selection.scenes || []) {
    const sc = allScenes.find(s => s.id === id);
    if (sc) {
      const text = extractTextFromTipTap(sc.subtitle) || extractTextFromTipTap(sc.summary)?.slice(0, 30) || "场景";
      badges.push({ key: "scenes", id, type: "scenes", title: text, subtitle: sc.chapterTitle });
    }
  }
  for (const id of selection.snippets || []) {
    const sn = snippets.find(s => s.id === id);
    if (sn) badges.push({ key: "snippets", id, type: "snippets", title: sn.name || "片段" });
  }
  for (const id of selection.codexEntries || []) {
    const entry = codexEntries.find(e => e.id === id);
    if (entry) badges.push({ key: "codexEntries", id, type: "codexEntries", title: entry.name || "条目", subtitle: entry.type });
  }
  for (const name of selection.codexTypes || []) {
    const count = codexEntries.filter(e => e.type === name).length;
    badges.push({ key: "codexTypes", id: name, type: "codexTypes", title: name, subtitle: `${count} 条目` });
  }
  for (const name of selection.codexCategories || []) {
    const count = codexEntries.filter(e => e.category === name).length;
    badges.push({ key: "codexCategories", id: name, type: "codexCategories", title: name, subtitle: `${count} 条目` });
  }
  for (const name of selection.codexTags || []) {
    const count = codexEntries.filter(e => e.tags?.includes(name)).length;
    badges.push({ key: "codexTags", id: name, type: "codexTags", title: name, subtitle: `${count} 条目` });
  }

  if (badges.length === 0) return null;

  return (
    <div className="ctx-badge-list">
      {badges.map(b => (
        <span key={`${b.key}-${b.id}`} className="ctx-badge">
          <span className="ctx-badge-icon">{typeIcon(b.type)}</span>
          <span className="ctx-badge-text">
            <span className="ctx-badge-title">{b.title}</span>
            {b.subtitle && <span className="ctx-badge-sub">{b.subtitle}</span>}
          </span>
          <button
            className="ctx-badge-delete"
            onClick={e => { e.stopPropagation(); onRemove(b.key as keyof ContextSelection, b.id || undefined); }}
            type="button"
          >×</button>
        </span>
      ))}
    </div>
  );
}
