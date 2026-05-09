/**
 * PermissionTree — 纯白名单复选框树组件
 *
 * rules: Set<string> — 有显式 allow 规则的路径集合
 * 前缀继承：父路径在 rules 中 → 子路径自动视为允许
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
  rules: Set<string>;
  onChange: (rules: Set<string>) => void;
  onSelect?: (path: string) => void;
  showCheckboxes?: boolean;
}

/** 判断节点勾选状态 */
function getCheckState(
  node: FolderNode,
  rules: Set<string>,
  inheritedAllowed: boolean,
): 'checked' | 'unchecked' | 'indeterminate' {
  const isAllowed = rules.has(node.path) || inheritedAllowed;

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
  inheritedAllowed,
  onChange,
  onSelect,
  showCheckboxes,
}: {
  node: FolderNode;
  depth: number;
  rules: Set<string>;
  inheritedAllowed: boolean;
  onChange: (rules: Set<string>) => void;
  onSelect?: (path: string) => void;
  showCheckboxes?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const state = getCheckState(node, rules, inheritedAllowed);
  const isAllowed = rules.has(node.path) || inheritedAllowed;
  const hasChildren = node.children.length > 0;

  const handleToggle = useCallback(() => {
    const newRules = new Set(rules);
    const allPaths = collectPaths(node);

    if (state === 'checked') {
      // 取消勾选：移除本节点 + 所有子节点的规则
      for (const p of allPaths) newRules.delete(p);
    } else {
      // 勾选：添加本节点，清除子节点（父覆盖子）
      newRules.add(node.path);
      for (let i = 1; i < allPaths.length; i++) newRules.delete(allPaths[i]);
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

        {showCheckboxes !== false && (
          <button
            onClick={handleToggle}
            className="flex items-center justify-center w-4 h-4 mr-1.5"
          >
            {state === 'checked' && (
              <div className="w-3.5 h-3.5 rounded bg-[var(--color-primary)] flex items-center justify-center">
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
        )}

        {hasChildren ? (
          expanded ? <FolderOpen size={14} className="text-[var(--color-primary)]/70" /> : <Folder size={14} className="text-[var(--color-primary)]/70" />
        ) : (
          <Folder size={14} className="text-slate-500" />
        )}
        <span
          className="text-sm text-slate-300 group-hover:text-slate-100 select-none"
          onClick={() => onSelect?.(node.path)}
        >
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
              inheritedAllowed={isAllowed}
              onChange={onChange}
              onSelect={onSelect}
              showCheckboxes={showCheckboxes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PermissionTree({ folders, rules, onChange, onSelect, showCheckboxes }: PermissionTreeProps) {
  return (
    <div className="py-2">
      {folders.map(node => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          rules={rules}
          inheritedAllowed={false}
          onChange={onChange}
          onSelect={onSelect}
          showCheckboxes={showCheckboxes}
        />
      ))}
      {folders.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-8">暂无文件夹</div>
      )}
    </div>
  );
}
