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

export interface WritingChapter {
  id: string;
  project_id: string;
  title: string;
  content: string;
  word_count: number;
  sort_order: number;
  volume: string;
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

export interface WritingChapterV2 {
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
  scene_number: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ManuscriptTree {
  acts: Array<WritingAct & {
    chapters: Array<WritingChapterV2 & { scenes: WritingScene[] }>;
  }>;
}

export interface ManuscriptFlatItem {
  type: "act" | "chapter" | "scene" | "separator" | "add-scene" | "add-chapter" | "add-act";
  [key: string]: any;
}

export interface WritingSetting {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  category: string;
  content: Record<string, unknown>;
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

// ── 章节 ──

export async function listChapters(projectId: string): Promise<WritingChapter[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/chapters`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createChapter(projectId: string, title = "新章节", volume = ""): Promise<WritingChapter> {
  const res = await fetch(`${BASE}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, title, volume }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createChapterV2(actId: string, projectId: string, title = ""): Promise<WritingChapterV2> {
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

export async function reorderChapters(projectId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${BASE}/chapters/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, ordered_ids: orderedIds }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── 世界观设定 ──

export async function listSettings(projectId: string, category?: string): Promise<WritingSetting[]> {
  const params = category ? new URLSearchParams({ category }).toString() : "";
  const url = `${BASE}/projects/${encodeURIComponent(projectId)}/settings${params ? "?" + params : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSetting(
  projectId: string, name: string, category = "custom",
  parentId: string | null = null, content: Record<string, unknown> = {},
): Promise<WritingSetting> {
  const res = await fetch(`${BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, name, category, parent_id: parentId, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSetting(id: string, data: Partial<WritingSetting>): Promise<WritingSetting> {
  const res = await fetch(`${BASE}/settings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSetting(id: string): Promise<void> {
  const res = await fetch(`${BASE}/settings/${encodeURIComponent(id)}`, { method: "DELETE" });
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

// ── Migration ──

export async function getMigrationStatus(): Promise<{ needs_migration: boolean }> {
  const res = await fetch(`${BASE}/system/migration-status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runMigration(): Promise<{ status: string; migrated: number }> {
  const res = await fetch(`${BASE}/system/run-migration`, { method: "POST" });
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
    chapters: Array<{ id: string; title: string; content: string; word_count: number; sort_order: number; volume: string }>;
    settings: Array<{ id: string; name: string; category: string; content: Record<string, unknown>; parent_id: string | null; sort_order: number; enabled: number }>;
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
