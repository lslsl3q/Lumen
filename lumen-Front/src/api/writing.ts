/**
 * T11 写作模式 API 请求层
 */

const API_BASE_URL = 'http://127.0.0.1:8888';
const BASE = `${API_BASE_URL}/writing`;

export interface WritingProject {
  id: string;
  name: string;
  description: string;
  channel_id: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface WritingAct {
  id: string;
  project_id: string;
  title: string;
  numerate: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface WritingChapter {
  id: string;
  act_id: string;
  project_id: string;
  title: string;
  numerate: number;
  show_number: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface WritingScene {
  id: string;
  chapter_id: string;
  content: string;
  summary: string;
  subtitle: string;
  codex_ids: string[];
  scene_number: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface WritingSnippet {
  id: string;
  project_id: string;
  name: string;
  content: string;
  pinned: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export type ManuscriptChapter = WritingChapter & { scenes: WritingScene[] };

export type ManuscriptAct = WritingAct & {
  chapters: ManuscriptChapter[];
};

export interface ManuscriptTree {
  acts: ManuscriptAct[];
}

export interface ManuscriptFlatItem {
  type: "act" | "chapter" | "scene" | "separator" | "add-scene" | "add-chapter" | "add-act";
  [key: string]: any;
}

export interface CodexEntry {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  description: Record<string, unknown>;
  aliases: string[];
  tags: string[];
  category: string | null;
  custom_fields: Record<string, unknown>;
  relations: { target_id: string; type: string }[];
  graph_entity_id: string | null;
  sort_order: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

// ── 作品 ──

export async function listProjects(): Promise<WritingProject[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createProject(name: string, description = "", channelId = ""): Promise<WritingProject> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, channel_id: channelId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProject(id: string): Promise<WritingProject> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateProject(id: string, data: Partial<WritingProject>): Promise<WritingProject> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export function getCoverUrl(projectId: string): string {
  return `${BASE}/projects/${encodeURIComponent(projectId)}/cover`;
}

export async function uploadCover(projectId: string, file: File): Promise<{ cover: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/cover`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── 章节 ──

export async function listChapters(projectId: string): Promise<WritingChapter[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/chapters`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createChapter(actId: string, projectId: string, title = ""): Promise<WritingChapter> {
  const res = await fetch(`${BASE}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ act_id: actId, project_id: projectId, title }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getChapter(id: string): Promise<WritingChapter> {
  const res = await fetch(`${BASE}/chapters/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateChapter(id: string, data: Partial<WritingChapter>): Promise<WritingChapter> {
  const res = await fetch(`${BASE}/chapters/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteChapter(id: string): Promise<void> {
  const res = await fetch(`${BASE}/chapters/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ── Codex (世界观设定) ──

export async function listCodex(projectId: string, type?: string): Promise<CodexEntry[]> {
  const params = type ? new URLSearchParams({ type }).toString() : "";
  const url = `${BASE}/projects/${encodeURIComponent(projectId)}/codex${params ? "?" + params : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCodex(
  projectId: string, name: string, type = "custom",
  parentId: string | null = null, description: Record<string, unknown> = {},
  aliases: string[] = [], tags: string[] = [],
): Promise<CodexEntry> {
  const res = await fetch(`${BASE}/codex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, name, type, parent_id: parentId, description, aliases, tags }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateCodex(id: string, data: Partial<CodexEntry>): Promise<CodexEntry> {
  const res = await fetch(`${BASE}/codex/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCodex(id: string): Promise<void> {
  const res = await fetch(`${BASE}/codex/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** 导出整本作品 */
export function getExportUrl(projectId: string, format: "txt" | "md" | "docx" = "txt"): string {
  return `${BASE}/projects/${encodeURIComponent(projectId)}/export?format=${format}`;
}

// ── Acts ──

export async function listActs(projectId: string): Promise<WritingAct[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/acts`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createAct(projectId: string, title = "", numerate = true): Promise<WritingAct> {
  const res = await fetch(`${BASE}/acts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, title, numerate }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateAct(id: string, data: Partial<WritingAct>): Promise<WritingAct> {
  const res = await fetch(`${BASE}/acts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteAct(id: string): Promise<void> {
  const res = await fetch(`${BASE}/acts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ── Scenes ──

export async function listScenes(chapterId: string): Promise<WritingScene[]> {
  const res = await fetch(`${BASE}/chapters/${encodeURIComponent(chapterId)}/scenes`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createScene(chapterId: string): Promise<WritingScene> {
  const res = await fetch(`${BASE}/scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_id: chapterId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateScene(id: string, data: Partial<WritingScene>): Promise<WritingScene> {
  const res = await fetch(`${BASE}/scenes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteScene(id: string): Promise<void> {
  const res = await fetch(`${BASE}/scenes/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ── Reorder ──

export async function reorderActs(projectId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/acts/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, ordered_ids: orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderChapters(actId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/chapters/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ act_id: actId, ordered_ids: orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderScenes(chapterId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/scenes/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_id: chapterId, ordered_ids: orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Manuscript ──

export async function getManuscript(projectId: string): Promise<ManuscriptTree> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/manuscript`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getManuscriptFlat(projectId: string): Promise<ManuscriptFlatItem[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/manuscript-flat`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── 快照 ──

export interface WritingSnapshot {
  id: string;
  project_id: string;
  type: "auto" | "manual" | "pre_restore";
  label: string;
  size_bytes: number;
  created_at: number;
  stats?: {
    chapter_count: number;
    total_words: number;
    setting_count: number;
  };
}

export interface WritingSnapshotDetail extends WritingSnapshot {
  data: {
    project: { id: string; name: string; description: string; metadata: Record<string, unknown> };
    acts?: Array<{
      id: string; title: string; numerate: number; sort_order: number;
      chapters: Array<{
        id: string; title: string; numerate: number; show_number: number; sort_order: number;
        scenes: Array<{ id: string; content: string; summary: string; subtitle: string; sort_order: number }>;
      }>;
    }>;
    codex: Array<{ id: string; name: string; type: string; description: Record<string, unknown>; parent_id: string | null; aliases: string[]; tags: string[]; sort_order: number; enabled: number }>;
    snapshot_version: number;
  };
}

export async function listSnapshots(projectId: string): Promise<{ items: WritingSnapshot[]; total: number }> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/snapshots`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSnapshot(projectId: string, label = "", type: "auto" | "manual" = "manual"): Promise<WritingSnapshot> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, type }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSnapshotDetail(snapshotId: string): Promise<WritingSnapshotDetail> {
  const res = await fetch(`${BASE}/snapshots/${encodeURIComponent(snapshotId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function restoreSnapshot(snapshotId: string): Promise<{ restored_at: number; backup_snapshot_id: string }> {
  const res = await fetch(`${BASE}/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const res = await fetch(`${BASE}/snapshots/${encodeURIComponent(snapshotId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ── Snippets ──

export async function listSnippets(projectId: string): Promise<WritingSnippet[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/snippets`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSnippet(projectId: string, name = ""): Promise<WritingSnippet> {
  const res = await fetch(`${BASE}/snippets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSnippet(id: string): Promise<WritingSnippet> {
  const res = await fetch(`${BASE}/snippets/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSnippet(id: string, data: Partial<Pick<WritingSnippet, "name" | "content" | "pinned">>): Promise<WritingSnippet> {
  const res = await fetch(`${BASE}/snippets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSnippet(id: string): Promise<void> {
  const res = await fetch(`${BASE}/snippets/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ── Labels (标签) ──

export interface WritingLabel {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
}

export async function listLabels(projectId: string): Promise<WritingLabel[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/labels`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createLabel(projectId: string, name = "", color = "Gray"): Promise<WritingLabel> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateLabel(id: string, data: Partial<Pick<WritingLabel, "name" | "color">>): Promise<WritingLabel> {
  const res = await fetch(`${BASE}/labels/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteLabel(id: string): Promise<void> {
  const res = await fetch(`${BASE}/labels/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderLabels(projectId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/labels/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
}


// ── Chat Thread / Message ──

const CHAT_BASE = `${API_BASE_URL}/writing/chat`;

export interface WritingChatThread {
  id: string;
  book_id: string;
  name: string;
  ai_mode: string;
  pinned: number;
  pinned_side: "left" | "right";
  created_at: number;
  updated_at: number;
  message_count?: number;
}

export interface WritingChatMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: string | null;
  created_at: number;
}

export async function listChatThreads(bookId: string): Promise<WritingChatThread[]> {
  const res = await fetch(`${CHAT_BASE}/threads?book_id=${encodeURIComponent(bookId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createChatThread(bookId: string, name?: string, aiMode?: string): Promise<WritingChatThread> {
  const res = await fetch(`${CHAT_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: bookId, name: name || "", ai_mode: aiMode || "chat" }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateChatThread(id: string, data: Partial<Pick<WritingChatThread, "name" | "ai_mode" | "pinned" | "pinned_side">>): Promise<WritingChatThread> {
  const res = await fetch(`${CHAT_BASE}/threads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteChatThread(id: string): Promise<void> {
  const res = await fetch(`${CHAT_BASE}/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function listChatMessages(threadId: string, limit?: number): Promise<WritingChatMessage[]> {
  const params = limit ? `?limit=${limit}` : "";
  const res = await fetch(`${CHAT_BASE}/threads/${encodeURIComponent(threadId)}/messages${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createChatMessage(threadId: string, role: string, content: string, metadata?: string): Promise<WritingChatMessage> {
  const res = await fetch(`${CHAT_BASE}/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, metadata: metadata || null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ── Plot System ──

export type PlotBeatKind =
  | "action" | "conflict" | "despair" | "relief" | "reward"
  | "twist" | "result" | "escalation" | "scheme" | "revenge"
  | "romance" | "comedy" | "cliffhanger" | "lore-reveal";

// Removed (2026-05-29): setup, mystery, reveal, payoff — covered by PlotLink relations
// Removed: PlotBeatStatus (planted/resolved/abandoned) — foreshadow lifecycle now handled by PlotLink

export type PlotLineType = "main" | "subplot" | "dark";

export const PLOT_LINE_TYPES: PlotLineType[] = ["main", "subplot", "dark"];

export type PlotLineStatus = "active" | "dormant" | "surfaced" | "resolved";

export type PlotLinkRelation = "trigger" | "foreshadow" | "suspense" | "reveal";

export const PLOT_BEAT_KIND_LABELS: Record<PlotBeatKind, string> = {
  action: "行动", conflict: "冲突", despair: "低谷",
  relief: "释放", reward: "回报", twist: "反转", result: "结果",
  escalation: "升级", scheme: "算计", revenge: "复仇",
  romance: "暧昧", comedy: "调侃", cliffhanger: "断章", "lore-reveal": "设定揭示",
};

export const PLOT_BEAT_KIND_COLORS: Record<PlotBeatKind, string> = {
  action: "#3b82f6", conflict: "#ef4444", despair: "#6b21a8",
  relief: "#22c55e", reward: "#eab308", twist: "#f97316", result: "#6b7280",
  escalation: "#f59e0b", scheme: "#8b5cf6", revenge: "#dc2626",
  romance: "#ec4899", comedy: "#14b8a6", cliffhanger: "#a855f7", "lore-reveal": "#06b6d4",
};

export const PLOT_LINE_TYPE_LABELS: Record<PlotLineType, string> = {
  main: "主线", subplot: "支线", dark: "暗线",
};

export const PLOT_LINK_RELATION_LABELS: Record<PlotLinkRelation, string> = {
  trigger: "触发", foreshadow: "伏笔", suspense: "悬念", reveal: "揭示",
};

export interface PlotBeat {
  id: string;
  node_id: string;
  kind: PlotBeatKind;
  summary: string;
  effect: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface PlotNode {
  id: string;
  line_id: string;
  title: string;
  summary: string;
  purpose: string;
  scene_ids: string[];
  sort_order: number;
  start_ch?: number;
  end_ch?: number;
  resolved?: boolean;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  beats?: PlotBeat[];
}

export interface PlotLine {
  id: string;
  arc_id: string;
  name: string;
  title: string;
  type: PlotLineType;
  color: string;
  status: PlotLineStatus;
  summary: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  nodes?: PlotNode[];
}

export interface PlotArc {
  id: string;
  plot_id: string;
  title: string;
  summary: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  lines?: PlotLine[];
}

export interface Plot {
  id: string;
  project_id: string;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  arcs?: PlotArc[];
}

export interface PlotLink {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation: PlotLinkRelation;
  note: string;
  created_at: number;
  updated_at: number;
}

// Plot L1
export async function getPlot(projectId: string): Promise<Plot> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/plot`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPlotTree(projectId: string): Promise<Plot | null> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/plot-tree`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePlotApi(id: string, data: Partial<Pick<Plot, "title" | "summary">>): Promise<Plot> {
  const res = await fetch(`${BASE}/plots/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Arc L2
export async function createArc(plotId: string, title = "", summary = ""): Promise<PlotArc> {
  const res = await fetch(`${BASE}/plots/${encodeURIComponent(plotId)}/arcs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plot_id: plotId, title, summary }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listArcs(plotId: string): Promise<PlotArc[]> {
  const res = await fetch(`${BASE}/plots/${encodeURIComponent(plotId)}/arcs`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateArc(id: string, data: Partial<Pick<PlotArc, "title" | "summary">>): Promise<PlotArc> {
  const res = await fetch(`${BASE}/arcs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteArc(id: string): Promise<void> {
  const res = await fetch(`${BASE}/arcs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Line L3
export async function createLine(arcId: string, name = "", title = "", type: PlotLineType = "subplot", color = "#6b7280"): Promise<PlotLine> {
  const res = await fetch(`${BASE}/arcs/${encodeURIComponent(arcId)}/lines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arc_id: arcId, name, title, type, color }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listLines(arcId: string): Promise<PlotLine[]> {
  const res = await fetch(`${BASE}/arcs/${encodeURIComponent(arcId)}/lines`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateLine(id: string, data: Partial<Pick<PlotLine, "name" | "title" | "type" | "color" | "status" | "summary">>): Promise<PlotLine> {
  const res = await fetch(`${BASE}/lines/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteLine(id: string): Promise<void> {
  const res = await fetch(`${BASE}/lines/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Node L4
export async function createNode(lineId: string, title = "", summary = "", purpose = "", sceneIds?: string[], startCh?: number, endCh?: number): Promise<PlotNode> {
  const res = await fetch(`${BASE}/lines/${encodeURIComponent(lineId)}/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line_id: lineId, title, summary, purpose, scene_ids: sceneIds, start_ch: startCh, end_ch: endCh }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listNodes(lineId: string): Promise<PlotNode[]> {
  const res = await fetch(`${BASE}/lines/${encodeURIComponent(lineId)}/nodes`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateNode(id: string, data: Partial<Pick<PlotNode, "title" | "summary" | "purpose" | "start_ch" | "end_ch" | "resolved">> & { scene_ids?: string[] }): Promise<PlotNode> {
  const res = await fetch(`${BASE}/nodes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteNode(id: string): Promise<void> {
  const res = await fetch(`${BASE}/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Beat L5
export async function createBeat(nodeId: string, kind: PlotBeatKind = "action", summary = "", effect = ""): Promise<PlotBeat> {
  const res = await fetch(`${BASE}/nodes/${encodeURIComponent(nodeId)}/beats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_id: nodeId, kind, summary, effect }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listBeats(nodeId: string): Promise<PlotBeat[]> {
  const res = await fetch(`${BASE}/nodes/${encodeURIComponent(nodeId)}/beats`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateBeat(id: string, data: Partial<Pick<PlotBeat, "kind" | "summary" | "effect">>): Promise<PlotBeat> {
  const res = await fetch(`${BASE}/beats/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBeat(id: string): Promise<void> {
  const res = await fetch(`${BASE}/beats/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Link
export async function createPlotLink(sourceNodeId: string, targetNodeId: string, relation: PlotLinkRelation = "trigger", note = ""): Promise<PlotLink> {
  const res = await fetch(`${BASE}/plot-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_node_id: sourceNodeId, target_node_id: targetNodeId, relation, note }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listLinksForNode(nodeId: string): Promise<PlotLink[]> {
  const res = await fetch(`${BASE}/nodes/${encodeURIComponent(nodeId)}/links`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePlotLink(id: string): Promise<void> {
  const res = await fetch(`${BASE}/plot-links/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
