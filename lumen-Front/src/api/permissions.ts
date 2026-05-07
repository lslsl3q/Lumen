/**
 * 权限管理 API 客户端
 */
import type {
  AclRule,
  BatchPermissionRequest,
} from '../types/permissions';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** GET /permissions/character/{id} */
export async function getCharacterPermissions(
  characterId: string,
  resourceType: string,
  resourceId: string,
): Promise<AclRule[]> {
  const params = new URLSearchParams({ resource_type: resourceType, resource_id: resourceId });
  const res = await fetch(
    `${API_BASE_URL}/permissions/character/${encodeURIComponent(characterId)}?${params}`,
  );
  if (!res.ok) throw new Error(`获取角色权限失败: ${res.status}`);
  return res.json();
}

/** PUT /permissions/character/{id} */
export async function setCharacterPermissions(
  characterId: string,
  data: BatchPermissionRequest,
): Promise<{ status: string; count: number }> {
  const res = await fetch(
    `${API_BASE_URL}/permissions/character/${encodeURIComponent(characterId)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
  if (!res.ok) throw new Error(`更新角色权限失败: ${res.status}`);
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

/** PUT /permissions/resource/{type}/{id} */
export async function setResourcePermissions(
  resourceType: string,
  resourceId: string,
  characterId: string,
  data: BatchPermissionRequest,
): Promise<{ status: string; count: number }> {
  const res = await fetch(
    `${API_BASE_URL}/permissions/resource/${resourceType}/${encodeURIComponent(resourceId)}?character_id=${encodeURIComponent(characterId)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
  if (!res.ok) throw new Error(`更新资源权限失败: ${res.status}`);
  return res.json();
}
