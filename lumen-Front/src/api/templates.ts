const API_BASE_URL = "http://127.0.0.1:8888";

export interface TemplateInputDef {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  multi?: boolean;
  generate_only?: boolean;
  // Three toggleable content types (NC-style: one input can have multiple)
  custom_content?: boolean;
  content_selection?: boolean;
  checkbox?: boolean;
  // Custom content config
  options?: string[];
  placeholder?: string;
  allow_formatted_text?: boolean;
  default?: string;
  // Content selection config
  content_types?: string[];
  add_to_context?: boolean;
  display_name?: string;
  // Inheritance
  source_component?: string;
}

export interface TemplateMeta {
  name: string;
  path: string;
  label: string;
  type: string;
  category: string;
  model: string;
  has_user_section: boolean;
  inputs?: TemplateInputDef[];
  description?: string;
  user_created?: boolean;
}

export interface TemplateDetail extends TemplateMeta {
  content: string;
  usages: string[];
}

export interface TemplateListResponse {
  templates: TemplateMeta[];
  grouped: Record<string, TemplateMeta[]>;
}

export interface PreviewResult {
  name: string;
  system: string;
  user: string;
  messages?: { role: string; content: string }[];
}

export async function listTemplates(category?: string): Promise<TemplateListResponse> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const res = await fetch(`${API_BASE_URL}/templates/list?${params}`);
  if (!res.ok) throw new Error(`获取模板列表失败: ${res.status}`);
  return res.json();
}

export async function getTemplate(path: string): Promise<TemplateDetail> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`获取模板失败: ${res.status}`);
  return res.json();
}

export async function updateTemplate(path: string, content: string): Promise<{ status: string; name: string; label: string }> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail?.message || data.detail || `保存失败: ${res.status}`);
  }
  return res.json();
}

export async function previewTemplate(path: string, mockData?: Record<string, unknown>): Promise<PreviewResult> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(path)}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mock_data: mockData || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail?.message || data.detail || `预览失败: ${res.status}`);
  }
  return res.json();
}

export async function createComponent(name: string, type: string, category: string, content: string): Promise<{ status: string; name: string; path: string }> {
  const res = await fetch(`${API_BASE_URL}/templates/components`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type, category, content }),
  });
  if (!res.ok) throw new Error(`创建失败: ${res.status}`);
  return res.json();
}

export async function deleteTemplate(path: string): Promise<{ status: string; name: string }> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
  return res.json();
}
