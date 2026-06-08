import { useState, useEffect, useCallback } from "react";
import { listTemplates, getTemplate, createComponent, type TemplateMeta, type TemplateDetail } from "../../../api/templates";
import { TemplateListSidebar } from "./TemplateListSidebar";
import { TemplateEditorTabs } from "./components/TemplateEditorTabs";

export function PromptManagerView() {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listTemplates();
        if (cancelled) return;
        setTemplates(data.templates);
        if (data.templates.length > 0 && !selectedName) {
          setSelectedName(data.templates[0].name);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedName) {
      setSelectedTemplate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getTemplate(selectedName);
        if (!cancelled) setSelectedTemplate(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "加载模板失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedName]);

  const handleCreateInGroup = useCallback(async (groupKey: string) => {
    const defaults: Record<string, { type: string; category: string; name: string }> = {
      scene_beat: { type: "beat_generate", category: "writing", name: "New Scene Beat" },
      summarization: { type: "scene_summarization", category: "writing", name: "New Scene Summarization" },
      text_replacement: { type: "text_replacement", category: "writing", name: "New Text Replacement" },
      workshop_chat: { type: "workshop_chat", category: "writing", name: "New Workshop Chat" },
      analysis: { type: "analyze_chapter", category: "writing", name: "New Analysis" },
      gm: { type: "prompt_component", category: "gm", name: "New GM Component" },
      components: { type: "prompt_component", category: "components", name: "New Prompt Component" },
    };
    const d = defaults[groupKey] || { type: "prompt_component", category: "components", name: "New Component" };

    // Generate unique name if conflicts exist
    const existingNames = new Set(templates.map((t) => t.label || t.name));
    let name = d.name;
    let counter = 2;
    while (existingNames.has(name)) {
      name = `${d.name} ${counter}`;
      counter++;
    }

    try {
      const result = await createComponent(name, d.type, d.category, "");
      const data = await listTemplates();
      setTemplates(data.templates);
      setSelectedName(result.name);
    } catch (e: any) {
      setError(e.message || "创建失败");
    }
  }, [templates]);

  const handleDelete = useCallback(async () => {
    const data = await listTemplates();
    setTemplates(data.templates);
    setSelectedName(data.templates.length > 0 ? data.templates[0].name : null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-zinc-500">
        Loading templates…
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-red-400">{error}</div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-surface-deep">
      <TemplateListSidebar
        templates={templates}
        selectedName={selectedName}
        onSelect={setSelectedName}
        onCreateInGroup={handleCreateInGroup}
      />
      <div className="flex-1 min-h-0 min-w-0">
        {selectedTemplate ? (
          <TemplateEditorTabs key={selectedTemplate.name} template={selectedTemplate} onDelete={handleDelete} onRefreshList={async (newName) => { const data = await listTemplates(); setTemplates(data.templates); setSelectedName(newName); }} />
        ) : (
          <div className="flex items-center justify-center h-full text-[13px] text-zinc-500">
            Select a template to start editing
          </div>
        )}
      </div>
    </div>
  );
}
