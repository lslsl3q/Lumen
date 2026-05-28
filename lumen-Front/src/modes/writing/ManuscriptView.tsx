import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { ActHeader } from "./ActHeader";
import { ChapterHeader } from "./ChapterHeader";
import { sceneEditorRegistry } from "./SceneEditor";
import { LazySceneEditor } from "./LazySceneEditor";
import { SceneSeparator } from "./SceneSeparator";
import { InsertButton } from "./InsertButton";
import { BeatNavigator, type BeatInfo } from "./BeatNavigator";
import { ScrollArea } from "../../components/ui/scroll-area";
import type { ManuscriptFlatItem } from "../../api/writing";

export function ManuscriptView({ filter }: { filter?: { type: "all" } | { type: "act"; id: string } | { type: "chapter"; id: string } }) {
  const acts = useWritingStore((s) => s.acts);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [beats, setBeats] = useState<BeatInfo[]>([]);

  const effectiveFilter = filter || { type: "all" as const };

  const { filteredActs, chapterOnly } = useMemo(() => {
    if (effectiveFilter.type === "all") return { filteredActs: acts, chapterOnly: null as string | null };
    if (effectiveFilter.type === "act") return { filteredActs: acts.filter((a) => a.id === effectiveFilter.id), chapterOnly: null };
    const chId = effectiveFilter.id;
    const filtered = acts.filter((a) => (a as any).chapters?.some((ch: any) => ch.id === chId));
    return { filteredActs: filtered, chapterOnly: chId };
  }, [acts, effectiveFilter]);

  const filteredItems: ManuscriptFlatItem[] = [];
  for (const act of filteredActs) {
    filteredItems.push({ type: "act", ...act });
    const chs = ((act as any).chapters || []).filter((ch: any) =>
      chapterOnly ? ch.id === chapterOnly : true
    );
    for (const ch of chs) {
      filteredItems.push({ type: "chapter", ...ch });
      const scenes = ch.scenes || [];
      for (let i = 0; i < scenes.length; i++) {
        if (i > 0) filteredItems.push({ type: "separator" });
        filteredItems.push({ type: "scene", ...scenes[i] });
      }
      filteredItems.push({ type: "add-scene", chapter_id: ch.id });
    }
    if (!chapterOnly) {
      filteredItems.push({ type: "add-chapter", act_id: act.id });
    }
  }
  if (effectiveFilter.type === "all") {
    filteredItems.push({ type: "add-act", project_id: activeProjectId || "" });
  }

  const collectBeats = useCallback(() => {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const beatEls = scrollRef.current.querySelectorAll("[data-beat-id]");
      const newBeats: BeatInfo[] = [];
      beatEls.forEach((el) => {
        const htmlEl = el as HTMLElement;
        newBeats.push({
          id: htmlEl.dataset.beatId!,
          color: htmlEl.dataset.beatColor || "rgb(248, 113, 113)",
          label: htmlEl.dataset.beatLabel || "Beat",
          offsetTop: htmlEl.offsetTop,
          height: htmlEl.offsetHeight,
        });
      });
      setBeats(newBeats);
    });
  }, []);

  useEffect(() => {
    collectBeats();
    window.addEventListener("resize", collectBeats);
    return () => window.removeEventListener("resize", collectBeats);
  }, [acts, collectBeats]);

  const activeSceneId = useWritingStore((s) => s.activeSceneId);
  const jumpPosition = useWritingStore((s) => s.formatPreferences.jumpPosition);

  useEffect(() => {
    if (!activeSceneId) return;
    const el = document.querySelector(`[data-scene-id="${activeSceneId}"]`);
    if (!el) return;

    const viewport = el.closest("[data-slot=\"scroll-area-viewport\"]") as HTMLElement | null;
    if (!viewport) return;

    const placeCursor = (attempts = 0) => {
      const editor = sceneEditorRegistry.get(activeSceneId);
      if (editor) {
        editor.commands.focus(jumpPosition === "end" ? "end" : "start");
        return;
      }
      // Editor might still be lazy-loading, retry
      if (attempts < 20) {
        setTimeout(() => placeCursor(attempts + 1), 100);
      }
    };

    let done = false;
    const onScrollEnd = () => {
      if (done) return;
      done = true;
      viewport.removeEventListener("scrollend", onScrollEnd);
      placeCursor();
    };

    viewport.addEventListener("scrollend", onScrollEnd, { once: false });
    const fallback = setTimeout(() => { onScrollEnd(); }, 1000);

    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => {
      clearTimeout(fallback);
      viewport.removeEventListener("scrollend", onScrollEnd);
    };
  }, [activeSceneId, jumpPosition]);

  const totalHeight = scrollRef.current?.scrollHeight || 1;

  const handleInsert = async (type: string, parentId?: string) => {
    const store = useWritingStore.getState();
    switch (type) {
      case "scene":
        if (parentId) await store.createScene(parentId);
        break;
      case "chapter": {
        if (parentId) await store.createChapter(parentId, "新章节");
        break;
      }
      case "act":
        await store.createAct("新卷");
        break;
    }
  };

  return (
    <ScrollArea className="flex-1 writing-manuscript-scroll" viewportRef={scrollRef}>
      <BeatNavigator
        scrollContainerRef={scrollRef}
        beats={beats}
        totalHeight={totalHeight}
      />
      <div ref={contentRef} className="pr-6">
        <div style={{ height: "20vh" }} />
        {filteredItems.map((item, i) => {
          switch (item.type) {
            case "act":
              return <ActHeader key={item.id} act={item as any} />;
            case "chapter": {
              const prevItem = i > 0 ? filteredItems[i - 1] : null;
              return (
                <ChapterHeader
                  key={item.id}
                  chapter={item as any}
                  isAfterAct={prevItem?.type === "act"}
                />
              );
            }
            case "scene":
              return <LazySceneEditor key={item.id} scene={item as any} />;
            case "separator":
              return <SceneSeparator key={`sep-${i}`} />;
            case "add-scene":
              return (
                <InsertButton
                  key={`add-sc-${item.chapter_id}`}
                  variant="scene"
                  label="新场景"
                  onClick={() => handleInsert("scene", item.chapter_id as string)}
                />
              );
            case "add-chapter":
              return (
                <InsertButton
                  key={`add-ch-${item.act_id}`}
                  variant="chapter"
                  label="新章节"
                  onClick={() => handleInsert("chapter", item.act_id as string)}
                />
              );
            case "add-act":
              return (
                <InsertButton
                  key="add-act"
                  variant="act"
                  label="新卷"
                  onClick={() => handleInsert("act")}
                />
              );
            default:
              return null;
          }
        })}
        <div style={{ height: "50vh" }} />
      </div>
    </ScrollArea>
  );
}
