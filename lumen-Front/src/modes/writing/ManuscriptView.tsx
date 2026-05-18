import { useRef } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { ActHeader } from "./ActHeader";
import { ChapterHeader } from "./ChapterHeader";
import { SceneEditor } from "./SceneEditor";
import { SceneSeparator } from "./SceneSeparator";
import { InsertButton } from "./InsertButton";
import type { ManuscriptFlatItem } from "../../api/writing";

export function ManuscriptView() {
  const acts = useWritingStore((s) => s.acts);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items: ManuscriptFlatItem[] = [];
  for (const act of acts) {
    items.push({ type: "act", ...act });
    const chs = (act as any).chapters || [];
    for (const ch of chs) {
      items.push({ type: "chapter", ...ch });
      const scenes = ch.scenes || [];
      for (let i = 0; i < scenes.length; i++) {
        if (i > 0) items.push({ type: "separator" });
        items.push({ type: "scene", ...scenes[i] });
      }
      items.push({ type: "add-scene", chapter_id: ch.id });
    }
    items.push({ type: "add-chapter", act_id: act.id });
  }
  items.push({ type: "add-act", project_id: activeProjectId || "" });

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
    <div ref={scrollRef} className="flex-1 overflow-y-auto writing-manuscript-scroll">
      <div style={{ height: "20vh" }} />
      {items.map((item, i) => {
        switch (item.type) {
          case "act":
            return <ActHeader key={item.id} act={item as any} isFirst={i === 0} />;
          case "chapter": {
            const prevItem = i > 0 ? items[i - 1] : null;
            return (
              <ChapterHeader
                key={item.id}
                chapter={item as any}
                isAfterAct={prevItem?.type === "act"}
              />
            );
          }
          case "scene":
            return <SceneEditor key={item.id} scene={item as any} />;
          case "separator":
            return <SceneSeparator key={`sep-${i}`} />;
          case "add-scene":
            return (
              <InsertButton
                key={`add-sc-${item.chapter_id}`}
                label="新场景"
                onClick={() => handleInsert("scene", item.chapter_id as string)}
              />
            );
          case "add-chapter":
            return (
              <InsertButton
                key={`add-ch-${item.act_id}`}
                label="新章节"
                onClick={() => handleInsert("chapter", item.act_id as string)}
              />
            );
          case "add-act":
            return (
              <InsertButton
                key="add-act"
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
  );
}
