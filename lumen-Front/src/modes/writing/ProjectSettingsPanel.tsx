import { useState, useCallback, useRef } from "react";
import { AlertTriangle, Trash2, Download, Upload, ImageIcon, Plus, GripVertical, HelpCircle, Star, Sparkles } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RadioDot } from "../../components/ui/radio-dot";
import { useWritingStore } from "../../stores/useWritingStore";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ToggleSwitch } from "../../components/ui/toggle-switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { getCoverUrl, uploadCover } from "../../api/writing";
import { LabelRow } from "../../components/editors/LabelRow";

type SettingsTab = "metadata" | "writing" | "export";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "metadata", label: "Metadata" },
  { id: "writing", label: "Writing" },
  { id: "export", label: "Export" },
];

export function ProjectSettingsPanel() {
  const initialTab = useWritingStore((s) => s.settingsPanelTab);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  return (
    <div className="flex flex-col h-full">
      {/* Horizontal Tab Bar */}
      <div className="flex-none flex items-center gap-1 px-6 pt-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer border-b-2 ${
              activeTab === tab.id
                ? "text-zinc-200 border-zinc-300"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-8 py-6">
          {activeTab === "metadata" && <MetadataTab />}
          {activeTab === "writing" && <WritingTab />}
          {activeTab === "export" && <ExportTab />}
        </div>
      </div>
    </div>
  );
}

// NC-aligned section card styles
const sectionCls = "rounded-lg bg-zinc-800/25 p-6 mb-6";
const headingCls = "text-[14px] font-semibold text-text-primary mb-2";
const descCls = "text-[14px] text-text-secondary mb-4 leading-relaxed";
const labelCls = "block text-[14px] font-medium text-text-primary mb-1.5";
const inputCls = "!h-[37px] !bg-[rgba(63,63,70,0.25)] !border-zinc-600 !rounded-sm !text-[14px] !text-zinc-300 placeholder:!text-zinc-600 focus:!border-zinc-500 focus:!ring-0";

// ── Metadata Tab ──

function MetadataTab() {
  const project = useWritingStore((s) => s.getActiveProject());
  const updateProject = useWritingStore((s) => s.updateProject);
  const deleteProject = useWritingStore((s) => s.deleteProject);
  const [name, setName] = useState(project?.name || "");
  const [desc, setDesc] = useState(project?.description || "");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverVersion, setCoverVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNameBlur = useCallback(() => {
    if (!project || name === project.name) return;
    updateProject(project.id, { name });
  }, [project, name, updateProject]);

  const handleDescBlur = useCallback(() => {
    if (!project || desc === project.description) return;
    updateProject(project.id, { description: desc });
  }, [project, desc, updateProject]);

  const handleDelete = useCallback(async () => {
    if (!project) return;
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    await deleteProject(project.id);
    useWritingStore.getState().setShowSettingsPanel(false);
  }, [project, deleteConfirm, deleteProject]);

  const handleCoverUpload = useCallback(async (file: File) => {
    if (!project) return;
    setCoverUploading(true);
    try {
      await uploadCover(project.id, file);
      setCoverVersion((v) => v + 1);
    } catch (e) {
      console.error("Cover upload failed:", e);
    } finally {
      setCoverUploading(false);
    }
  }, [project]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleCoverUpload(file);
  }, [handleCoverUpload]);

  if (!project) {
    return <div className="text-zinc-500 text-sm">未选择作品</div>;
  }

  const coverSrc = getCoverUrl(project.id) + (coverVersion ? `?v=${coverVersion}` : "");

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left column: METADATA + DANGER ZONE */}
      <div className="flex flex-col gap-6">
        {/* METADATA section card */}
        <div className={sectionCls}>
          <h3 className={headingCls}>作品信息</h3>
          <p className={descCls}>
            作品的基本信息，用于管理和识别你的小说。
          </p>

          <div className="space-y-5">
            <div>
              <label className={labelCls}>作品标题</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="未命名小说"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>简介</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={handleDescBlur}
                placeholder="简要描述你的小说…"
                rows={3}
                className="w-full bg-[rgba(63,63,70,0.25)] border border-zinc-600 rounded-sm text-[14px] text-zinc-300 px-2.5 py-1.5 outline-none resize-none placeholder:text-zinc-600 focus:border-zinc-500"
              />
            </div>

            <div className="flex items-center gap-4 text-[12px] text-zinc-500">
              <span>创建于 {new Date(project.created_at * 1000).toLocaleDateString()}</span>
              <span>更新于 {new Date(project.updated_at * 1000).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* DANGER ZONE section card */}
        <div className="rounded-lg border border-red-900/30 bg-zinc-800/25 p-6">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            危险操作
          </h3>
          <p className={descCls}>
            此区域的操作不可撤销，请谨慎操作。
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="!h-[29px] !text-[12px] !font-semibold !bg-zinc-800 !border-zinc-700 !rounded-sm !text-zinc-300 hover:!bg-zinc-700"
              onClick={handleDelete}
            >
              {deleteConfirm ? (
                <span className="text-red-400">确认删除</span>
              ) : (
                <>
                  <Trash2 className="w-3 h-3 mr-1" />
                  删除作品
                </>
              )}
            </Button>
            {deleteConfirm && (
              <Button
                variant="ghost"
                size="sm"
                className="!text-[12px] text-zinc-500 hover:text-zinc-300"
                onClick={() => setDeleteConfirm(false)}
              >
                取消
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Right column: COVER */}
      <div className={sectionCls}>
        <h3 className={headingCls}>封面</h3>
        <p className={descCls}>
          小说的封面图片，会显示在作品集页面。
        </p>

        <div
          className="aspect-[3/4] border-2 border-dashed border-zinc-600 rounded-lg flex flex-col items-center justify-center gap-3 hover:border-zinc-500 transition-colors cursor-pointer overflow-hidden"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {coverVersion > 0 ? (
            <img
              src={coverSrc}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-10 h-10 text-zinc-600" />
          )}
          <div className="text-center">
            <Button
              variant="ghost"
              className="!text-[13px] !font-medium text-zinc-400 hover:text-zinc-200"
              disabled={coverUploading}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {coverUploading ? "上传中…" : "上传封面"}
            </Button>
            <p className="text-[12px] text-zinc-600 mt-1">或拖拽图片到此区域</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCoverUpload(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// ── Writing Tab ──

type Tense = "past" | "present";
type POV = "1st" | "2nd" | "3rd" | "3rd-limited" | "3rd-omniscient";

const TENSE_OPTIONS: { value: Tense; label: string }[] = [
  { value: "past", label: "过去时" },
  { value: "present", label: "现在时" },
];

const POV_OPTIONS: { value: POV; label: string }[] = [
  { value: "1st", label: "第一人称" },
  { value: "2nd", label: "第二人称" },
  { value: "3rd", label: "第三人称" },
  { value: "3rd-limited", label: "第三人称（有限视角）" },
  { value: "3rd-omniscient", label: "第三人称（全知视角）" },
];

function WritingTab() {
  const project = useWritingStore((s) => s.getActiveProject());
  const updateProject = useWritingStore((s) => s.updateProject);
  const labels = useWritingStore((s) => s.labels);
  const codexEntries = useWritingStore((s) => s.codexEntries);
  const createLabelAction = useWritingStore((s) => s.createLabelAction);
  const reorderLabelsAction = useWritingStore((s) => s.reorderLabelsAction);

  const meta = (project?.metadata || {}) as Record<string, unknown>;
  const [tense, setTense] = useState<Tense>((meta.tense as Tense) || "past");
  const [pov, setPov] = useState<POV>((meta.pov as POV) || "3rd");
  const [language, setLanguage] = useState((meta.language as string) || "zh-CN");
  const [narrativeCharacterId, setNarrativeCharacterId] = useState((meta.narrative_character_id as string) || "");

  // Filter Codex entries to characters only
  const characterEntries = codexEntries.filter((e) => e.type === "Character" || e.type === "character");

  const handleTenseChange = useCallback((v: string) => {
    const val = v as Tense;
    setTense(val);
    if (project) updateProject(project.id, { metadata: { ...meta, tense: val } });
  }, [project, meta, updateProject]);

  const handlePovChange = useCallback((v: string) => {
    const val = v as POV;
    setPov(val);
    if (project) updateProject(project.id, { metadata: { ...meta, pov: val } });
  }, [project, meta, updateProject]);

  const handleLanguageChange = useCallback((v: string) => {
    setLanguage(v);
    if (project) updateProject(project.id, { metadata: { ...meta, language: v } });
  }, [project, meta, updateProject]);

  const handleCharacterChange = useCallback((v: string) => {
    const val = v === "__none__" ? "" : v;
    setNarrativeCharacterId(val);
    if (project) updateProject(project.id, { metadata: { ...meta, narrative_character_id: val } });
  }, [project, meta, updateProject]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !project) return;
    const ids = labels.map((l) => l.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, active.id as string);
    reorderLabelsAction(project.id, reordered);
  }, [labels, project, reorderLabelsAction]);

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: LABELS / MARKERS */}
      <div className={sectionCls}>
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className={headingCls.replace(" mb-2", "")}>标签 / 标记</h3>
          <span className="relative group cursor-help">
            <HelpCircle className="w-[18px] h-[18px] text-zinc-500" />
            <span className="absolute left-5 top-0 hidden group-hover:block z-50 w-[300px] px-3 py-2 rounded bg-zinc-900 border border-zinc-600 text-[12px] text-zinc-300 leading-relaxed shadow-lg pointer-events-none">
              标签用于组织和分类场景，支持按状态、支线、时间设定等维度分组。可以使用分组前缀（如 "Status: Draft"）来保持标签井然有序。标签也可用于导出和筛选。创建后，在任何场景的 Label 按钮中即可选择应用。
            </span>
          </span>
        </div>
        <p className={descCls}>
          用标签来组织场景的状态、支线等。支持分组前缀（如 "Status: Draft"）。
        </p>

        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={labels.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 mb-3">
              {labels.map((label) => (
                <SortableLabelRow key={label.id} label={label} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button
          variant="ghost"
          className="!h-[29px] !text-[12px] !font-semibold text-zinc-400 hover:text-zinc-200"
          onClick={async () => {
            await createLabelAction("New Label", "Gray");
          }}
          type="button"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Label
        </Button>

        <div className="mt-4 pt-3 border-t border-zinc-700/50">
          <p className="text-[14px] font-medium text-text-primary mb-2">Presets</p>
          <p className="text-[13px] text-zinc-500 mb-3">快速添加一组预设标签：</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="!h-[29px] !text-[12px] !font-semibold !bg-zinc-800 !border-zinc-700 !rounded-sm !text-zinc-300 hover:!bg-zinc-700"
              onClick={async () => {
                for (const p of SCENE_STATUS_PRESET) {
                  await createLabelAction(p.name, p.color);
                }
              }}
              type="button"
            >
              Scene status
            </Button>
            <Button
              variant="outline"
              className="!h-[29px] !text-[12px] !font-semibold !bg-zinc-800 !border-zinc-700 !rounded-sm !text-zinc-300 hover:!bg-zinc-700"
              onClick={async () => {
                for (const p of TEMPORAL_PRESET) {
                  await createLabelAction(p.name, p.color);
                }
              }}
              type="button"
            >
              Temporal setting
            </Button>
          </div>
        </div>
      </div>

      {/* Right: PROSE */}
      <div className={sectionCls}>
        <h3 className={headingCls}>写作设置</h3>

        <div className="space-y-8 mt-4">
          {/* 时态 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className={labelCls.replace(" mb-1.5", "")}>时态</label>
              <span title="此设置会传递给 AI 用于续写生成">
                <Sparkles className="w-3.5 h-3.5 text-amber-500/60" />
              </span>
              <span className="relative group cursor-help">
                <HelpCircle className="w-4 h-4 text-zinc-500" />
                <span className="absolute left-5 top-0 hidden group-hover:block z-50 w-[300px] px-3 py-2 rounded bg-zinc-900 border border-zinc-600 text-[12px] text-zinc-300 leading-relaxed shadow-lg pointer-events-none">
                  时态决定了故事事件发生的时间视角：<br /><br />
                  <b>过去时</b>（"她走了"）是小说中最常用的时态，描述已经完成的动作，适合叙事和回忆。<br /><br />
                  <b>现在时</b>（"她走"）营造即时感和紧迫感，让读者仿佛亲历其境。<br /><br />
                  保持时态一致有助于读者清晰跟随时间线。
                </span>
              </span>
            </div>
            <p className="text-[13px] text-zinc-500 mb-2">小说的叙述时态，会影响 AI 续写生成的文本时态。</p>
            <div className="flex items-center gap-3">
              {TENSE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer" onClick={() => handleTenseChange(opt.value)}>
                  <RadioDot selected={tense === opt.value} />
                  <span className={`text-[14px] transition-colors duration-300 ${tense === opt.value ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 语言 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className={labelCls.replace(" mb-1.5", "")}>语言</label>
              <span title="此设置会传递给 AI 用于续写生成">
                <Sparkles className="w-3.5 h-3.5 text-amber-500/60" />
              </span>
              <span className="relative group cursor-help">
                <HelpCircle className="w-4 h-4 text-zinc-500" />
                <span className="absolute left-5 top-0 hidden group-hover:block z-50 w-[300px] px-3 py-2 rounded bg-zinc-900 border border-zinc-600 text-[12px] text-zinc-300 leading-relaxed shadow-lg pointer-events-none">
                  设定小说的写作语言。此设置会影响拼写检查的语言规则、断词处理，以及 AI 生成内容时的语言偏好。
                </span>
              </span>
            </div>
            <p className="text-[13px] text-zinc-500 mb-2">小说的写作语言，用于拼写检查和 AI 输出。</p>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="选择语言" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="zh-TW">繁體中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
                <SelectItem value="ko">한국어</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 人称视角 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className={labelCls.replace(" mb-1.5", "")}>人称视角</label>
              <span title="此设置会传递给 AI 用于续写生成">
                <Sparkles className="w-3.5 h-3.5 text-amber-500/60" />
              </span>
              <span className="relative group cursor-help">
                <HelpCircle className="w-4 h-4 text-zinc-500" />
                <span className="absolute left-5 top-0 hidden group-hover:block z-50 w-[300px] px-3 py-2 rounded bg-zinc-900 border border-zinc-600 text-[12px] text-zinc-300 leading-relaxed shadow-lg pointer-events-none">
                  人称视角决定故事由谁来讲述、读者能知道多少：<br /><br />
                  <b>第一人称</b>：叙述者是故事中的角色，读者只能看到该角色所知。<br />
                  <b>第二人称</b>：将读者当作角色（"你走进了房间"），较少见但沉浸感强。<br />
                  <b>第三人称</b>：外部叙述者讲述故事。<br />
                  <b>有限视角</b>：只跟随一个角色的内心。<br />
                  <b>全知视角</b>：叙述者知晓所有角色的想法和感受。<br /><br />
                  可在场景级别单独覆盖。
                </span>
              </span>
            </div>
            <p className="text-[13px] text-zinc-500 mb-2">小说的叙述人称视角，会影响 AI 续写。（可在场景级别覆盖。）</p>
            <div className="flex flex-col gap-2">
              {POV_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer" onClick={() => handlePovChange(opt.value)}>
                  <RadioDot selected={pov === opt.value} />
                  <span className={`text-[14px] transition-colors duration-300 ${pov === opt.value ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>{opt.label}</span>
                </label>
              ))}
            </div>

            {/* 叙事角色 — 绑定 Codex 人物 */}
            <div className="mt-3 pt-3 border-t border-zinc-700/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <label className="text-[13px] font-medium text-zinc-400">叙事角色</label>
                <span title="此设置会传递给 AI 用于续写生成">
                  <Sparkles className="w-3 h-3 text-amber-500/60" />
                </span>
                <span className="relative group cursor-help">
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="absolute left-4 top-0 hidden group-hover:block z-50 w-[300px] px-3 py-2 rounded bg-zinc-900 border border-zinc-600 text-[12px] text-zinc-300 leading-relaxed shadow-lg pointer-events-none">
                    绑定叙事视角角色后，该角色的 Codex 信息（性格、背景、能力等）会在每次 AI 生成时强制注入上下文——即使当前文本未提到该角色也能获得其完整设定。<br /><br />
                    未绑定时，Codex 条目仅通过「提及检测」注入：文本中出现角色名才触发。<br /><br />
                    此功能主要用于第一人称或第三人称有限视角——视角人物在文本中可能不频繁出现自己的名字（如"我走到桌前"），导致 AI 漏掉该角色的设定。绑定后可确保 AI 始终理解当前视角人物。
                  </span>
                </span>
              </div>
              <p className="text-[12px] text-zinc-500 mb-2">绑定后，该角色的 Codex 信息在每次 AI 生成时强制注入，无需文本提及。适用于有限视角叙事。</p>
              <Select value={narrativeCharacterId || "__none__"} onValueChange={handleCharacterChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {!narrativeCharacterId
                      ? "— 不指定 —"
                      : characterEntries.find((e) => e.id === narrativeCharacterId)?.name || "选择角色…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— 不指定 —</SelectItem>
                  {characterEntries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Export Tab ──

function ExportTab() {
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const project = useWritingStore((s) => s.getActiveProject());
  const acts = useWritingStore((s) => s.acts);
  const [format, setFormat] = useState("txt");
  const [exportProse, setExportProse] = useState(true);
  const [exportSummaries, setExportSummaries] = useState(false);
  const [includeActTitles, setIncludeActTitles] = useState(true);
  const [includeSceneSubtitles, setIncludeSceneSubtitles] = useState(true);
  const [includeCodex, setIncludeCodex] = useState(false);
  const [includeSnippets, setIncludeSnippets] = useState(false);
  const [includeChats, setIncludeChats] = useState(false);

  const handleExport = useCallback(() => {
    if (!activeProjectId) return;
    const params = new URLSearchParams({
      format,
      prose: String(exportProse),
      summaries: String(exportSummaries),
      act_titles: String(includeActTitles),
      scene_subtitles: String(includeSceneSubtitles),
      codex: String(includeCodex),
      snippets: String(includeSnippets),
      chats: String(includeChats),
    });
    window.open(`http://127.0.0.1:8888/writing/projects/${encodeURIComponent(activeProjectId)}/export?${params}`, "_blank");
  }, [activeProjectId, format, exportProse, exportSummaries, includeActTitles, includeSceneSubtitles, includeCodex, includeSnippets, includeChats]);

  const totalScenes = acts.reduce(
    (sum, act) => sum + ((act as any).chapters || []).reduce(
      (cs: number, ch: any) => cs + (ch.scenes || []).length, 0,
    ), 0,
  );

  return (
    <>
      <h3 className={headingCls}>EXPORT YOUR DATA</h3>
      <p className={descCls}>
        You can export your novel data into multiple formats.{" "}
        {!project ? "" : `(${totalScenes} scenes total)`}
      </p>

      {/* Scene tree preview */}
      <div className="mb-6 max-h-[300px] overflow-y-auto rounded border border-zinc-700/50 bg-surface-deep p-3">
        {acts.length === 0 && (
          <div className="text-[12px] text-zinc-600 text-center py-4">No scenes to export</div>
        )}
        {acts.map((act) => (
          <div key={act.id} className="mb-2">
            <label className="flex items-center gap-1.5 px-1 py-0.5 text-[13px] font-semibold text-zinc-300">
              <input type="checkbox" defaultChecked className="accent-zinc-400" />
              {act.title || `Act ${(act.sort_order ?? 0) + 1}`}
            </label>
            {((act as any).chapters || []).map((ch: any) => (
              <div key={ch.id} className="ml-3 mb-1">
                <label className="flex items-center gap-1.5 px-1 py-0.5 text-[12px] text-zinc-400">
                  <input type="checkbox" defaultChecked className="accent-zinc-400" />
                  {ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`}
                </label>
                {(ch.scenes || []).map((sc: any) => (
                  <div key={sc.id} className="ml-3">
                    <label className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-zinc-500">
                      <input type="checkbox" defaultChecked className="accent-zinc-400" />
                      {sc.subtitle || sc.summary?.slice(0, 30) || `Scene ${(sc.sort_order ?? 0) + 1}`}
                    </label>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Format */}
      <div className="mb-6">
        <label className={labelCls}>Novel File Format</label>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="txt">Plain Text (.txt)</SelectItem>
            <SelectItem value="md">Markdown (.md)</SelectItem>
            <SelectItem value="docx">Word (.docx)</SelectItem>
          </SelectContent>
        </Select>
        {format === "docx" && (
          <p className="text-[13px] text-zinc-500 mt-2">
            Not all features are supported in DOCX format. The exported text might not look exactly like it does in the editor.
          </p>
        )}
      </div>

      {/* General Options */}
      <div className="mb-6">
        <label className={labelCls}>General Options</label>
        <div className="space-y-2.5 mt-3">
          <ToggleRow label="Export Prose" checked={exportProse} onChange={setExportProse} />
          <ToggleRow label="Export Summaries" checked={exportSummaries} onChange={setExportSummaries} />
          <ToggleRow label="Include Act Titles" checked={includeActTitles} onChange={setIncludeActTitles} />
          <ToggleRow label="Include Scene Subtitles" checked={includeSceneSubtitles} onChange={setIncludeSceneSubtitles} />
        </div>
      </div>

      {/* Project Export */}
      <div className="mb-6">
        <label className={labelCls}>Project Export</label>
        <p className="text-[13px] text-zinc-500 mb-3">When exporting the full project, the resulting file will be a .ZIP archive containing all the selected content.</p>
        <div className="space-y-2.5">
          <ToggleRow label="Include full Codex" checked={includeCodex} onChange={setIncludeCodex} />
          <ToggleRow label="Include all Snippets" checked={includeSnippets} onChange={setIncludeSnippets} />
          <ToggleRow label="Include all Chats" checked={includeChats} onChange={setIncludeChats} />
        </div>
      </div>

      <Button
        onClick={handleExport}
        disabled={!activeProjectId}
        className="!h-[37px] !text-[14px] !font-semibold !bg-zinc-700 !border-zinc-600 !rounded-sm !text-zinc-200 hover:!bg-zinc-600"
      >
        <Download className="w-4 h-4 mr-1.5" />
        Export
      </Button>
    </>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-zinc-300">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Label Colors (from shared LabelRow) ──

// ── SortableLabelRow (with drag handle + star) ──

function SortableLabelRow({ label }: { label: import("../../api/writing").WritingLabel }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: label.id });

  const updateLabelAction = useWritingStore((s) => s.updateLabelAction);
  const deleteLabelAction = useWritingStore((s) => s.deleteLabelAction);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <LabelRow
        name={label.name}
        color={label.color}
        onNameChange={(name) => updateLabelAction(label.id, { name })}
        onColorChange={(color) => updateLabelAction(label.id, { color })}
        onDelete={() => deleteLabelAction(label.id)}
        leading={
          <>
            <button
              {...attributes}
              {...listeners}
              className="p-0.5 cursor-grab text-zinc-600 hover:text-zinc-400 shrink-0"
              type="button"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-0.5 shrink-0"
              type="button"
              title="AI 可见性（暂未接入）"
            >
              <Star className="w-3 h-3 text-zinc-600" />
            </button>
          </>
        }
      />
    </div>
  );
}

// ── Label Presets ──

const SCENE_STATUS_PRESET = [
  { name: "Draft", color: "Gray" },
  { name: "First Edit", color: "Blue" },
  { name: "Second Edit", color: "Purple" },
  { name: "Final", color: "Green" },
  { name: "Needs Review", color: "Orange" },
];

const TEMPORAL_PRESET = [
  { name: "Past", color: "Brown" },
  { name: "Present", color: "Blue" },
  { name: "Future", color: "Purple" },
  { name: "Flashback", color: "Orange" },
  { name: "Flash-forward", color: "Pink" },
];
