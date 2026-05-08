/**
 * 权限系统类型定义（纯白名单模型）
 */

/** 单条权限条目 */
export interface AclEntry {
  folder_path: string;
  action: 'read' | 'write';
}

/** 角色简要信息（权限页用） */
export interface CharacterBrief {
  id: string;
  name: string;
  avatar?: string;
}
