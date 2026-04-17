/**
 * Persona API 客户端
 */
import type {
  PersonaListItem,
  PersonaCard,
  PersonaCreatePayload,
  PersonaUpdatePayload,
  PersonaSwitchPayload,
  ActivePersonaResponse,
} from '../types/persona';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /personas/list */
export async function listPersonas(): Promise<PersonaListItem[]> {
  const res = await fetch(`${API_BASE_URL}/personas/list`);
  if (!res.ok) throw new Error(`获取 Persona 列表失败: ${res.status}`);
  return res.json();
}

/** GET /personas/:id */
export async function getPersona(id: string): Promise<PersonaCard> {
  const res = await fetch(`${API_BASE_URL}/personas/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `获取 Persona 失败: ${res.status}`);
  }
  return res.json();
}

/** POST /personas/create */
export async function createPersona(payload: PersonaCreatePayload): Promise<PersonaCard> {
  const res = await fetch(`${API_BASE_URL}/personas/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `创建 Persona 失败: ${res.status}`);
  }
  return res.json();
}

/** PUT /personas/:id */
export async function updatePersona(id: string, payload: PersonaUpdatePayload): Promise<PersonaCard> {
  const res = await fetch(`${API_BASE_URL}/personas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `更新 Persona 失败: ${res.status}`);
  }
  return res.json();
}

/** DELETE /personas/:id */
export async function deletePersona(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/personas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `删除 Persona 失败: ${res.status}`);
  }
}

/** POST /personas/switch */
export async function switchPersona(payload: PersonaSwitchPayload): Promise<{ message: string; active_persona_id: string | null }> {
  const res = await fetch(`${API_BASE_URL}/personas/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `切换 Persona 失败: ${res.status}`);
  }
  return res.json();
}

/** GET /personas/active */
export async function getActivePersona(): Promise<ActivePersonaResponse> {
  const res = await fetch(`${API_BASE_URL}/personas/active`);
  if (!res.ok) throw new Error(`获取激活 Persona 失败: ${res.status}`);
  return res.json();
}
