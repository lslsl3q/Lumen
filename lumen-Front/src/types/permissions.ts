/**
 * 权限系统类型定义（纯白名单模型）
 */

/** 单条权限条目 */
export interface AclEntry {
  folder_path: string;
  action: 'read' | 'write';
}

/** 批量设置权限的请求体 */
export interface BatchPermissionRequest {
  resource_type: 'knowledge' | 'diary';
  resource_id: string;
  entries: AclEntry[];
}

/** 树节点（知识库文件夹结构） */
export interface PermissionTreeNode {
  path: string;
  label: string;
  children: PermissionTreeNode[];
  checked: 'checked' | 'unchecked' | 'indeterminate';
}

/** 角色简要信息（权限页用） */
export interface CharacterBrief {
  id: string;
  name: string;
  avatar?: string;
}
