import { useState } from "react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlanTreeItem } from "./PlanTreeItem";
import { InsertButton } from "./InsertButton";
import { useWritingStore } from "../../stores/useWritingStore";
import * as writingApi from "../../api/writing";

export function PlanView() {
  const acts = useWritingStore((s) => s.acts);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const loadManuscript = useWritingStore((s) => s.loadManuscript);

  const [expandedActs, setExpandedActs] = useState<Set<string>>(
    new Set(acts.map((a) => a.id))
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const toggleAct = (id: string) => {
    setExpandedActs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Full DnD reorder logic will be implemented in a follow-up task
    // For now, log the drag event
    console.log("Plan drag:", active.id, "->", over.id);
  };

  const handleInsert = async (type: string, parentId?: string) => {
    const store = useWritingStore.getState();
    switch (type) {
      case "scene":
        if (parentId) await store.createScene(parentId);
        break;
      case "chapter":
        if (parentId) await store.createChapter(parentId, "新章节");
        break;
      case "act":
        await store.createAct("新卷");
        break;
    }
    if (activeProjectId) await loadManuscript(activeProjectId);
  };

  const handleDelete = async (type: string, id: string) => {
    switch (type) {
      case "scene":
        await writingApi.deleteScene(id);
        break;
      case "chapter":
        await writingApi.deleteChapter(id);
        break;
      case "act":
        await writingApi.deleteAct(id);
        break;
    }
    if (activeProjectId) await loadManuscript(activeProjectId);
  };

  // Collect all sortable item IDs for SortableContext
  const allItemIds: string[] = [];
  for (const act of acts) {
    allItemIds.push(act.id);
    for (const ch of (act as any).chapters || []) {
      allItemIds.push(ch.id);
      for (const sc of ch.scenes || []) {
        allItemIds.push(sc.id);
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-deep">
      <div className="flex items-center h-12 px-3 border-b border-border-default">
        <span className="text-sm font-medium text-text-primary">Plan</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={allItemIds}
            strategy={verticalListSortingStrategy}
          >
            {acts.map((act) => (
              <div key={act.id}>
                <PlanTreeItem
                  id={act.id}
                  type="act"
                  title={act.title || `Act ${act.sort_order + 1}`}
                  isExpanded={expandedActs.has(act.id)}
                  onToggleExpand={() => toggleAct(act.id)}
                  onDelete={async () => handleDelete("act", act.id)}
                />
                {expandedActs.has(act.id) &&
                  ((act as any).chapters || []).map((ch: any) => (
                    <div key={ch.id}>
                      <PlanTreeItem
                        id={ch.id}
                        type="chapter"
                        title={ch.title || `Chapter ${ch.sort_order + 1}`}
                        onDelete={async () => handleDelete("chapter", ch.id)}
                      />
                      {(ch.scenes || []).map((sc: any) => (
                        <PlanTreeItem
                          key={sc.id}
                          id={sc.id}
                          type="scene"
                          title={
                            sc.summary ||
                            sc.subtitle ||
                            `Scene ${sc.sort_order + 1}`
                          }
                          onDelete={async () => handleDelete("scene", sc.id)}
                        />
                      ))}
                      <div className="ml-12 my-1">
                        <InsertButton
                          label="+ Scene"
                          onClick={() => handleInsert("scene", ch.id)}
                        />
                      </div>
                    </div>
                  ))}
                <div className="ml-6 my-1">
                  <InsertButton
                    label="+ Chapter"
                    onClick={() => handleInsert("chapter", act.id)}
                  />
                </div>
              </div>
            ))}
          </SortableContext>
        </DndContext>
        <InsertButton label="+ New Act" onClick={() => handleInsert("act")} />
      </div>
    </div>
  );
}
