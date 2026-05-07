/**
 * PermissionTree — 三态复选框树组件
 *
 * Props:
 * - folders: 知识库文件夹结构
 * - rules: 当前角色的 ACL 规则 (folder_path → access)
 * - defaultPublic: 资源类型是否默认公开（knowledge=true, diary=false）
 * - onChange: 勾选变化回调，返回完整规则列表
 */
import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

interface PermissionTreeProps {
  folders: FolderNode[];
  rules: Map<string, 'allow' | 'deny'>;
  defaultPublic: boolean;
  onChange: (rules: Map<string, 'allow' | 'deny'>) => void;
}

/** 判断文件夹的勾选状态 — 通过 inheritedAccess 传递父级有效权限 */
function getCheckState(
  node: FolderNode,
  rules: Map<string, 'allow' | 'deny'>,
  inheritedAccess: boolean,
): 'checked' | 'unchecked' | 'indeterminate' {
  const rule = rules.get(node.path);
  const isAllowed = rule ? rule === 'allow' : inheritedAccess;

  if (node.children.length === 0) {
    return isAllowed ? 'checked' : 'unchecked';
  }

  const childStates = node.children.map(c => getCheckState(c, rules, isAllowed));
  const allChecked = childStates.every(s => s === 'checked') && isAllowed;
  const allUnchecked = childStates.every(s => s === 'unchecked') && !isAllowed;

  if (allChecked) return 'checked';
  if (allUnchecked) return 'unchecked';
  return 'indeterminate';
}

/** 收集节点及所有子节点的路径 */
function collectPaths(node: FolderNode): string[] {
  const paths = [node.path];
  for (const child of node.children) {
    paths.push(...collectPaths(child));
  }
  return paths;
}

function TreeNode({
  node,
  depth,
  rules,
  inheritedAccess,
  onChange,
}: {
  node: FolderNode;
  depth: number;
  rules: Map<string, 'allow' | 'deny'>;
  inheritedAccess: boolean;
  onChange: (rules: Map<string, 'allow' | 'deny'>) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const state = getCheckState(node, rules, inheritedAccess);
  const rule = rules.get(node.path);
  const currentAccess = rule ? rule === 'allow' : inheritedAccess;
  const hasChildren = node.children.length > 0;

  const handleToggle = useCallback(() => {
    const nextAccess = state === 'checked' ? 'deny' : 'allow';
    const newRules = new Map(rules);

    newRules.set(node.path, nextAccess);

    const allPaths = collectPaths(node);
    for (let i = 1; i < allPaths.length; i++) {
      newRules.delete(allPaths[i]);
    }

    onChange(newRules);
  }, [state, node, rules, onChange]);

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 rounded hover:bg-slate-800/50 cursor-pointer group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-300"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <button onClick={handleToggle} className="flex items-center justify-center w-4 h-4 mr-1.5">
          {state === 'checked' && (
            <div className="w-3.5 h-3.5 rounded bg-amber-500 flex items-center justify-center">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          {state === 'unchecked' && (
            <div className="w-3.5 h-3.5 rounded border border-slate-600" />
          )}
          {state === 'indeterminate' && (
            <div className="w-3.5 h-3.5 rounded border border-slate-600 bg-slate-600/50 flex items-center justify-center">
              <div className="w-2 h-0.5 bg-slate-300 rounded" />
            </div>
          )}
        </button>

        {hasChildren ? (
          expanded ? <FolderOpen size={14} className="text-amber-500/70" /> : <Folder size={14} className="text-amber-500/70" />
        ) : (
          <Folder size={14} className="text-slate-500" />
        )}
        <span className="text-sm text-slate-300 group-hover:text-slate-100 select-none">
          {node.name}
        </span>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              rules={rules}
              inheritedAccess={currentAccess}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PermissionTree({ folders, rules, defaultPublic, onChange }: PermissionTreeProps) {
  return (
    <div className="py-2">
      {folders.map(node => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          rules={rules}
          inheritedAccess={defaultPublic}
          onChange={onChange}
        />
      ))}
      {folders.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-8">暂无文件夹</div>
      )}
    </div>
  );
}
