/**
 * 权限系统类型定义
 */

/** 单条 ACL 规则 */
export interface AclRule {
  folder_path: string;
  action: 'read' | 'write';
  access: 'allow' | 'deny';
}

/** 获取角色权限的请求参数 */
export interface CharacterPermissionParams {
  character_id: string;
  resource_type: 'knowledge' | 'diary';
  resource_id: string;
}

/** 批量设置权限的请求体 */
export interface BatchPermissionRequest {
  resource_type: 'knowledge' | 'diary';
  resource_id: string;
  entries: AclRule[];
}

/** 资源反查参数 */
export interface ResourcePermissionParams {
  resource_type: 'knowledge' | 'diary';
  resource_id: string;
  folder_path?: string;
  action?: 'read' | 'write';
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
