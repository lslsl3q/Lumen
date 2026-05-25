import { useState, useCallback, useMemo } from "react";
import type { TemplateDetail } from "../../../../api/templates";
import { updateTemplate, getTemplate } from "../../../../api/templates";
import { TabGeneral } from "./TabGeneral";
import { TemplateEditor, MessageSection, parseSections } from "./TabInstructions";
import { TabAdvanced, extractVariables, extractIncludes } from "./TabAdvanced";

const PROMPT_TABS = ["General", "Instructions", "Advanced"] as const;
const COMPONENT_TABS = ["Instructions", "Advanced", "Usages"] as const;

type PromptTab = (typeof PROMPT_TABS)[number];
type ComponentTab = (typeof COMPONENT_TABS)[number];

function isComponentCategory(template: TemplateDetail): boolean {
  return template.category === "components" || template.type === "prompt_component" || template.name.startsWith("components/");
}

export function TemplateEditorTabs({ template: initialTemplate }: { template: TemplateDetail }) {
  const [template, setTemplate] = useState<TemplateDetail>(initialTemplate);
  const [editContent, setEditContent] = useState(initialTemplate.content);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);

  const isComponent = isComponentCategory(template);

  const [promptTab, setPromptTab] = useState<PromptTab>("General");
  const [componentTab, setComponentTab] = useState<ComponentTab>("Instructions");

  const activeTab = isComponent ? componentTab : promptTab;

  const advancedCount = useMemo(() => {
    const vars = extractVariables(template.content);
    const incs = extractIncludes(template.content);
    return vars.length + incs.length;
  }, [template.content]);

  const usages = useMemo(() => {
    return template.usages || [];
  }, [template.usages]);

  const handleContentChange = useCallback(
    (v: string) => {
      setEditContent(v);
      setDirty(v !== template.content);
    },
    [template.content],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      await updateTemplate(template.name, editContent);
      const refreshed = await getTemplate(template.name);
      setTemplate(refreshed);
      setDirty(false);
    } catch (e: any) {
      setSaveError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [template.name, editContent]);

  const tabs = isComponent ? COMPONENT_TABS : PROMPT_TABS;

  return (
    <div className="flex flex-col h-full">
      {/* System prompt notice */}
      <div className="flex-none px-4 py-2 flex items-center gap-3 bg-zinc-800/30 border-b border-zinc-700/40">
        <span className="text-[13px] text-zinc-300">
          This is a <strong className="font-medium text-zinc-100">system prompt</strong>. To edit
          it, create a personal copy.
        </span>
        <div className="flex-1" />
        <button
          onClick={() => {/* TODO: clone functionality */}}
          className="px-2.5 py-1 rounded text-[12px] font-medium bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 transition-colors cursor-pointer border border-zinc-600/50"
          type="button"
        >
          Clone
        </button>
      </div>

      {/* Name field */}
      <div className="flex-none px-4 py-2 flex items-center gap-3 border-b border-zinc-700/40">
        <span className="text-[12px] text-zinc-500">Name</span>
        <input
          type="text"
          value={template.label || template.name}
          readOnly
          className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded px-2.5 py-1 text-[14px] text-zinc-200 outline-none"
        />
      </div>

      {/* Tab bar */}
      <div className="flex-none flex items-center gap-0 px-4 border-b border-zinc-800">
        {tabs.map((t) => {
          const count = t === "Advanced" ? advancedCount : t === "Usages" ? usages.length : 0;
          return (
            <button
              key={t}
              onClick={() => {
                if (isComponent) setComponentTab(t as ComponentTab);
                else setPromptTab(t as PromptTab);
              }}
              className={`px-3 py-2.5 text-[14px] transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                activeTab === t
                  ? "text-zinc-200 border-zinc-200"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
              type="button"
            >
              {t}
              {count > 0 && (
                <span className="text-[12px] text-zinc-400 bg-zinc-700 rounded px-1.5 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 rounded text-[12px] font-semibold bg-zinc-700 text-zinc-100 hover:bg-zinc-600 transition-colors cursor-pointer disabled:opacity-40"
            type="button"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {saveError && (
        <div className="flex-none px-4 py-2 bg-red-500/10 text-red-400 text-[12px] border-b border-zinc-700/40">
          {saveError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "General" && <TabGeneral template={template} />}
        {activeTab === "Instructions" && (
          <InstructionsPanel value={editContent} onChange={handleContentChange} />
        )}
        {activeTab === "Advanced" && <TabAdvanced template={template} />}
        {activeTab === "Usages" && <TabUsages template={template} />}
      </div>
    </div>
  );
}

/** Instructions tab: section preview above + CodeMirror editor below */
function InstructionsPanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showEditor, setShowEditor] = useState(false);
  const sections = useMemo(() => parseSections(value), [value]);
  const hasSections = sections.system !== value;

  return (
    <div className="flex flex-col h-full">
      {hasSections && (
        <div className="flex-none p-4 space-y-3 border-b border-zinc-700/40">
          <MessageSection label="System Message" content={sections.system} color="blue" />
          <MessageSection label="User" content={sections.user} color="emerald" />
          <button
            onClick={() => setShowEditor(!showEditor)}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
            type="button"
          >
            {showEditor ? "Hide raw editor" : "Edit raw template"}
          </button>
        </div>
      )}

      {(!hasSections || showEditor) && (
        <div className={hasSections ? "flex-1 min-h-0" : "flex-1 min-h-0"}>
          <TemplateEditor value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/** Usages tab: shows which templates include this component */
function TabUsages({ template }: { template: TemplateDetail }) {
  const usages = template.usages || [];

  if (usages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-zinc-500">
        No templates reference this component
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <p className="text-[12px] text-zinc-500 mb-3">
        This component is referenced by the following templates:
      </p>
      {usages.map((name: string) => (
        <div
          key={name}
          className="px-3 py-2 rounded text-[13px] text-zinc-300 bg-zinc-800/40 border border-zinc-700/30"
        >
          {name}
        </div>
      ))}
    </div>
  );
}
