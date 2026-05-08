/**
 * 权限管理 API 客户端（纯白名单模型）
 */
import type { AclEntry, BatchPermissionRequest } from '../types/permissions';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /permissions/character/{id} */
export async function getCharacterPermissions(
  characterId: string,
  resourceType: string,
  resourceId: string,
): Promise<AclEntry[]> {
  const params = new URLSearchParams({ resource_type: resourceType, resource_id: resourceId });
  const res = await fetch(
    `${API_BASE_URL}/permissions/character/${encodeURIComponent(characterId)}?${params}`,
  );
  if (!res.ok) throw new Error(`获取角色权限失败: ${res.status}`);
  return res.json();
}

/** GET /permissions/resource/{type}/{id} */
export async function getResourcePermissions(
  resourceType: string,
  resourceId: string,
  folderPath: string = '',
  action: string = 'read',
): Promise<string[]> {
  const params = new URLSearchParams({ folder_path: folderPath, action });
  const res = await fetch(
    `${API_BASE_URL}/permissions/resource/${resourceType}/${encodeURIComponent(resourceId)}?${params}`,
  );
  if (!res.ok) throw new Error(`获取资源权限失败: ${res.status}`);
  return res.json();
}

/** POST /permissions/batch-check — 返回 {char_id: boolean} */
export async function batchCheckPermissions(
  resourceType: string,
  resourceId: string,
  folderPath: string,
  characterIds: string[],
  action: string = 'read',
): Promise<Record<string, boolean>> {
  const res = await fetch(`${API_BASE_URL}/permissions/batch-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource_type: resourceType,
      resource_id: resourceId,
      folder_path: folderPath,
      action,
      character_ids: characterIds,
    }),
  });
  if (!res.ok) throw new Error(`批量权限检查失败: ${res.status}`);
  return res.json();
}

/** PUT /permissions/character/{id}/grant */
export async function grantAccess(
  characterId: string,
  resourceType: string,
  resourceId: string,
  folderPath: string,
  action: string = 'read',
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/permissions/character/${encodeURIComponent(characterId)}/grant`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource_type: resourceType, resource_id: resourceId, folder_path: folderPath, action }),
  });
  if (!res.ok) throw new Error(`授权失败: ${res.status}`);
  return res.json();
}

/** DELETE /permissions/character/{id}/revoke */
export async function revokeAccess(
  characterId: string,
  resourceType: string,
  resourceId: string,
  folderPath: string,
  action: string = 'read',
): Promise<{ status: string }> {
  const params = new URLSearchParams({ resource_type: resourceType, resource_id: resourceId, folder_path: folderPath, action });
  const res = await fetch(`${API_BASE_URL}/permissions/character/${encodeURIComponent(characterId)}/revoke?${params}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`撤销权限失败: ${res.status}`);
  return res.json();
}

/** PUT /permissions/character/{id} — 批量设置 */
export async function setCharacterPermissions(
  characterId: string,
  data: { resource_type: string; resource_id: string; entries: AclEntry[] },
): Promise<{ status: string; count: number }> {
  const res = await fetch(
    `${API_BASE_URL}/permissions/character/${encodeURIComponent(characterId)}?resource_type=${data.resource_type}&resource_id=${data.resource_id}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.entries) },
  );
  if (!res.ok) throw new Error(`更新角色权限失败: ${res.status}`);
  return res.json();
}
