import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { TemplateDetail } from "../../../../api/templates";
import { updateTemplate, deleteTemplate, createComponent } from "../../../../api/templates";
import { TabGeneral } from "./TabGeneral";
import { parseTemplate, serializeTemplate, MessageBlock, TemplateEditor } from "./TabInstructions";
import type { MessageSection as MessageSectionType } from "./TabInstructions";
import { GripDotsIcon } from "../../../../components/editors/BlockDragHandle";
import { TabAdvanced, extractIncludes } from "./TabAdvanced";

// ── Frontmatter utilities ──

/** Read a key from YAML frontmatter (raw string value, no quotes) */
function readFrontmatterKV(content: string, key: string): string {
  const fmEnd = content.indexOf("\n---", 3);
  if (fmEnd === -1) return "";
  const fmBlock = content.slice(0, fmEnd + 4);
  const match = fmBlock.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].replace(/^["']|["']$/g, "").trim();
}

/** Patch a key in YAML frontmatter; creates the key if missing */
function patchFrontmatterKV(content: string, key: string, value: string): string {
  const fmEnd = content.indexOf("\n---", 3);
  if (fmEnd === -1) return content;
  const fmBlock = content.slice(0, fmEnd + 4);
  const rest = content.slice(fmEnd + 4);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRe = new RegExp(`^${escaped}:.*$`, "m");
  let newFm: string;
  if (lineRe.test(fmBlock)) {
    newFm = fmBlock.replace(lineRe, `${key}: ${JSON.stringify(value)}`);
  } else {
    newFm = fmBlock.replace(/\n---\s*$/, `\n${key}: ${JSON.stringify(value)}\n---`);
  }
  return newFm + rest;
}

// ── Tab constants ──

const PROMPT_TABS = ["General", "Instructions", "Advanced"] as const;
const COMPONENT_TABS = ["Instructions", "Advanced", "Usages"] as const;

type PromptTab = (typeof PROMPT_TABS)[number] | "Description";
type ComponentTab = (typeof COMPONENT_TABS)[number] | "Description";
type AnyTab = PromptTab | ComponentTab;

function isComponentCategory(template: TemplateDetail): boolean {
  return template.category === "components" || template.type === "prompt_component" || template.name.startsWith("components/");
}

// ── Main component ──

export function TemplateEditorTabs({ template: initialTemplate, onDelete, onRefreshList }: { template: TemplateDetail; onDelete?: () => void; onRefreshList?: (newName: string) => void }) {
  const [template, setTemplate] = useState<TemplateDetail>(initialTemplate);
  const [editContent, setEditContent] = useState(initialTemplate.content);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);

  const isComponent = isComponentCategory(template);
  const isUserCreated = template.user_created === true;

  const [activeTab, setActiveTab] = useState<AnyTab>(
    isComponent ? "Instructions" : "General",
  );

  const advancedCount = useMemo(() => {
    const incs = extractIncludes(template.content);
    const inputCount = (template.inputs || []).length;
    return inputCount + incs.length;
  }, [template.content, template.inputs]);

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

  const handleSave = useCallback(async (content?: string) => {
    const toSave = content ?? editContent;
    if (toSave === template.content) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await updateTemplate(template.name, toSave);
      // 用后端返回的 label 更新本地状态（Name 改了 → label 跟着变）
      setTemplate((prev) => ({
        ...prev,
        content: toSave,
        label: result.label ?? prev.label,
      }));
      setDirty(false);
      // 通知父组件刷新左侧列表
      onRefreshList?.(template.name);
    } catch (e: any) {
      setSaveError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [template.name, editContent, template.content]);

  // Auto-save with debounce when dirty
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => handleSave(), 1500);
    return () => clearTimeout(timer);
  }, [dirty, editContent, handleSave]);

  const handleClone = useCallback(async () => {
    const label = template.label || template.name;
    const cloneName = label + " (Copy)";
    try {
      const result = await createComponent(
        cloneName,
        template.type || "prompt_component",
        template.category || "components",
        template.content,
      );
      onRefreshList?.(result.name);
    } catch (e: any) {
      setSaveError(e.message || "Clone failed");
    }
  }, [template, onRefreshList]);

  const tabs: AnyTab[] = useMemo(() => {
    const base: AnyTab[] = isComponent
      ? [...COMPONENT_TABS]
      : [...PROMPT_TABS];
    if (isUserCreated) base.push("Description");
    return base;
  }, [isComponent, isUserCreated]);

  const tabCounts: Record<string, number> = {
    Advanced: advancedCount,
    Usages: usages.length,
  };

  return (
    <div className="flex flex-col h-full bg-surface-deep">
      {/* System prompt notice — only for built-in templates */}
      {!isUserCreated && (
        <div className="flex-none px-4 py-2 flex items-center gap-3 bg-zinc-800/30 border-b border-zinc-700/40">
          <span className="text-[13px] text-zinc-300">
            This is a <strong className="font-medium text-zinc-100">system {isComponent ? "component" : "prompt"}</strong>. To edit
            it, create a personal copy.
          </span>
          <div className="flex-1" />
          <button
            onClick={handleClone}
            className="px-2.5 py-1 rounded text-[12px] font-medium bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 transition-colors cursor-pointer border border-zinc-600/50"
            type="button"
          >
            Clone
          </button>
        </div>
      )}

      {/* Name field */}
      <div className="flex-none px-4 py-2 flex items-center gap-3 border-b border-zinc-700/40">
        <span className="text-[12px] text-zinc-500">Name</span>
        {isUserCreated ? (
          <input
            type="text"
            defaultValue={template.label || template.name}
            onBlur={(e) => {
              const newContent = patchFrontmatterKV(editContent, "name", e.target.value);
              setEditContent(newContent);
              handleSave(newContent);
            }}
            className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded px-2.5 py-1 text-[14px] text-zinc-200 outline-none focus:border-zinc-500 transition-colors"
          />
        ) : (
          <input
            type="text"
            value={template.label || template.name}
            readOnly
            className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded px-2.5 py-1 text-[14px] text-zinc-200 outline-none"
          />
        )}
      </div>

      {/* Tab bar */}
      <div className="flex-none flex items-center gap-0 px-4 border-b border-zinc-800">
        {tabs.map((t) => {
          const count = tabCounts[t] || 0;
          return (
            <button
              key={t}
              onClick={() => {
                if (dirty) handleSave();
                setActiveTab(t);
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

        {/* ⋮ Action menu — only for user-created templates */}
        {isUserCreated && <TemplateMenu template={template} isComponent={isComponent} onDelete={onDelete} />}

        {saving && (
          <span className="text-[12px] text-zinc-500">Saving…</span>
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
          <InstructionsPanel
            value={editContent}
            onChange={handleContentChange}
            isComponent={isComponent}
            templatePath={template.path}
          />
        )}
        {activeTab === "Advanced" && <TabAdvanced template={template} editContent={editContent} onContentChange={handleContentChange} />}
        {activeTab === "Usages" && <TabUsages template={template} />}
        {activeTab === "Description" && (
          <TabDescription content={editContent} onChange={handleContentChange} />
        )}
      </div>
    </div>
  );
}

// ── Instructions Panel ──

interface InstructionsPanelProps {
  value: string;
  onChange: (v: string) => void;
  isComponent: boolean;
  templatePath: string;
}

function InstructionsPanel({ value, onChange, isComponent, templatePath }: InstructionsPanelProps) {
  const parsed = useMemo(() => parseTemplate(value), [value]);
  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const updateSections = useCallback(
    (updater: (sections: MessageSectionType[]) => MessageSectionType[]) => {
      const newSections = updater(parsedRef.current.sections);
      const serialized = serializeTemplate({
        frontmatter: parsedRef.current.frontmatter,
        sections: newSections,
      });
      onChange(serialized);
    },
    [onChange],
  );

  const handleContentChange = useCallback(
    (index: number, content: string) => {
      updateSections((sections) =>
        sections.map((s, i) => (i === index ? { ...s, content } : s)),
      );
    },
    [updateSections],
  );

  const handleRoleChange = useCallback(
    (index: number, role: MessageSectionType["role"]) => {
      updateSections((sections) =>
        sections.map((s, i) => (i === index ? { ...s, role } : s)),
      );
    },
    [updateSections],
  );

  const handleDelete = useCallback(
    (index: number) => {
      updateSections((sections) => sections.filter((_, i) => i !== index));
    },
    [updateSections],
  );

  const handleAddMessage = useCallback(() => {
    updateSections((sections) => [...sections, { role: "user", content: "" }]);
  }, [updateSections]);

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragIndex(index);
      const section = parsedRef.current.sections[index];
      const el = document.createElement("div");
      el.textContent = section?.role === "assistant" ? "AI Message" : "User Message";
      el.style.cssText = "padding:4px 12px;background:#27272a;border:1px solid #3f3f46;border-radius:4px;font-size:12px;color:#a1a1aa;";
      document.body.appendChild(el);
      e.dataTransfer.setDragImage(el, 0, 0);
      e.dataTransfer.effectAllowed = "move";
      setTimeout(() => el.remove(), 0);
    },
    [],
  );

  const sections = parsed.sections;

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      if (dragIndex === null || dragIndex === index) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(index);
    },
    [dragIndex],
  );

  const handleDrop = useCallback(
    (index: number) => () => {
      if (dragIndex === null || dragIndex === index) {
        setDragIndex(null);
        setDropTarget(null);
        return;
      }
      updateSections((sections) => {
        const arr = [...sections];
        const [moved] = arr.splice(dragIndex, 1);
        arr.splice(index, 0, moved);
        return arr;
      });
      setDragIndex(null);
      setDropTarget(null);
    },
    [dragIndex, updateSections],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  const handleCopyInclude = useCallback(() => {
    navigator.clipboard.writeText(`{% include "${templatePath}" %}`).catch(() => {});
  }, [templatePath]);

  // ── Component mode: single message only ──
  if (isComponent) {
    const singleSection = sections[0];
    const showMultiWarning = sections.length > 1;
    const editorContent = singleSection?.content ?? "";

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="p-4 space-y-3">
          <p className="text-[12px] text-zinc-500 leading-relaxed">
            Enter the instructions below that you want to reuse in other prompts. These instructions will be inserted into the prompt when you call it by its name.
          </p>

          {showMultiWarning && (
            <div className="px-3 py-2 bg-amber-500/10 text-amber-400 text-[12px] rounded border border-amber-500/20">
              This component has {sections.length} message sections. Only the first one is shown here; others are preserved in the file.
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[13px] font-medium text-zinc-300">Message</span>
              <button
                onClick={() => navigator.clipboard.writeText(editorContent).catch(() => {})}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                type="button"
              >
                Copy
              </button>
            </div>
            <div className="h-[300px] rounded overflow-hidden border border-zinc-700/30">
              <TemplateEditor value={editorContent} onChange={(v) => {
                if (singleSection) {
                  handleContentChange(0, v);
                } else {
                  // Empty content — add first section
                  updateSections(() => [{ role: "system", content: v }]);
                }
              }} />
            </div>
          </div>

          <button
            onClick={handleCopyInclude}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-700/40 border border-dashed border-zinc-700/50 hover:border-zinc-600/50 transition-colors cursor-pointer"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            Copy include() call
          </button>
        </div>
      </div>
    );
  }

  // ── Prompt mode: multi-message with drag/drop ──
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-zinc-500 leading-relaxed">
          Each prompt needs at least one system message. Some prompt types also need additional user or AI messages.
        </p>

        {sections.map((section, i) => {
          const isSystem = section.role === "system";

          if (isSystem) {
            return (
              <div key={i}>
                <MessageBlock
                  section={section}
                  index={i}
                  isSystem={true}
                  onChange={handleContentChange}
                  onRoleChange={handleRoleChange}
                  onDelete={handleDelete}
                />
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`flex items-start gap-1 ${dropTarget === i && dragIndex !== null ? "border-t-2 border-blue-500/50" : ""}`}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
            >
              <button
                className="flex-none mt-2 cursor-grab text-zinc-500 hover:text-zinc-300 active:cursor-grabbing"
                draggable={true}
                onDragStart={handleDragStart(i)}
                type="button"
              >
                <GripDotsIcon />
              </button>

              <div className="flex-1 min-w-0">
                <MessageBlock
                  section={section}
                  index={i}
                  isSystem={false}
                  onChange={handleContentChange}
                  onRoleChange={handleRoleChange}
                  onDelete={handleDelete}
                />
              </div>
            </div>
          );
        })}

        <button
          onClick={handleAddMessage}
          className="w-full py-2 rounded-lg text-[12px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-700/40 border border-dashed border-zinc-700/50 hover:border-zinc-600/50 transition-colors cursor-pointer"
          type="button"
        >
          + Add Message
        </button>
      </div>
    </div>
  );
}

// ── Description Tab ──

function TabDescription({ content, onChange }: { content: string; onChange: (v: string) => void }) {
  const [desc, setDesc] = useState(() => readFrontmatterKV(content, "description"));
  const wordCount = desc.split(/\s+/).filter(Boolean).length;

  const handleSave = useCallback(() => {
    const newContent = patchFrontmatterKV(content, "description", desc);
    onChange(newContent);
  }, [content, desc, onChange]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-zinc-500 leading-relaxed">
          A description of what this template does and how it should be used.
        </p>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Describe this template..."
          className="w-full h-[200px] bg-zinc-800/50 border border-zinc-700/50 rounded p-3 text-[13px] text-zinc-300 placeholder-zinc-600 resize-none outline-none font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded text-[12px] font-semibold bg-zinc-700 text-zinc-100 hover:bg-zinc-600 transition-colors cursor-pointer"
            type="button"
          >
            Save Description
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template action menu (⋮ button) ──

function TemplateMenu({ template, isComponent, onDelete }: { template: TemplateDetail; isComponent: boolean; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteTemplate(template.name);
      onDelete?.();
    } catch (e: any) {
      console.error("Delete failed:", e);
    }
    setOpen(false);
  }, [template, onDelete]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-2 text-[16px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer rounded hover:bg-zinc-700/50"
        type="button"
        aria-label="Actions"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1">
          {!isComponent && (
            <button
              onClick={() => { /* TODO: clone */ setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
              type="button"
            >
              Clone
            </button>
          )}
          <button
            onClick={handleClose}
            className="w-full text-left px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
            type="button"
            disabled
          >
            History
          </button>
          <div className="border-t border-zinc-700 my-1" />
          <button
            onClick={handleDelete}
            className="w-full text-left px-3 py-2 text-[13px] text-red-400 hover:bg-zinc-700 transition-colors cursor-pointer"
            type="button"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Usages Tab ──

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
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-2">
        <p className="text-[12px] text-zinc-500 mb-3">
          The following prompts are including this component in their instructions:
        </p>
        {usages.map((name: string) => (
          <div
            key={name}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] bg-zinc-800/50 border border-zinc-700/40"
          >
            <span className="text-zinc-300 truncate flex-1">{name}</span>
            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">Prompt</span>
          </div>
        ))}
      </div>
    </div>
  );
}
