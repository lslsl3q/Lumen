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

  const handleCreateInGroup = useCallback(async (_groupKey: string) => {
    const name = prompt("Component name:");
    if (!name?.trim()) return;
    try {
      const result = await createComponent(name.trim(), "prompt_component", "components", "# " + name.trim() + "\n\n");
      const data = await listTemplates();
      setTemplates(data.templates);
      setSelectedName(result.name);
    } catch (e: any) {
      setError(e.message || "创建失败");
    }
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
    <div className="flex h-full">
      <TemplateListSidebar
        templates={templates}
        selectedName={selectedName}
        onSelect={setSelectedName}
        onCreateInGroup={handleCreateInGroup}
      />
      <div className="flex-1 min-w-0">
        {selectedTemplate ? (
          <TemplateEditorTabs key={selectedTemplate.name} template={selectedTemplate} />
        ) : (
          <div className="flex items-center justify-center h-full text-[13px] text-zinc-500">
            Select a template to start editing
          </div>
        )}
      </div>
    </div>
  );
}
