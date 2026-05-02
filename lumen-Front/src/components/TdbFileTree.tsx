/**
 * TdbFileTree — 通用文件树组件
 *
 * 数据源：getTdbFileTree API 返回的 TdbFileFolder[]
 * 用途：MemoryWindow 文件视图、GraphEditor 源文件列表
 *
 * 通过 renderFileActions 注入不同的操作按钮
 */
import { useState, useEffect, type ReactNode } from 'react';
import type { TdbFileFolder } from '../api/tdb';

interface FileItem {
  name: string;
  path: string;
}

interface TdbFileTreeProps {
  folders: TdbFileFolder[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** 每个文件行的操作按钮区域 */
  renderFileActions?: (file: FileItem) => ReactNode;
  /** 文件列表底部的额外内容（如"全部重抽"或孤立条目） */
  footer?: ReactNode;
}

function TdbFileTree({ folders, selectedPath, onSelect, renderFileActions, footer }: TdbFileTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 新 folders 加载时默认展开
  useEffect(() => {
    setExpanded(prev => {
      const next = { ...prev };
      let changed = false;
      for (const f of folders) {
        if (!(f.path in next)) {
          next[f.path] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [folders]);

  if (folders.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-slate-700">无源文件</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {folders.map(folder => (
        <div key={folder.path || folder.name}>
          {/* 文件夹头 */}
          {folder.path && (
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [folder.path]: !prev[folder.path] }))}
              className="w-full flex items-center gap-1.5 px-3 py-1 cursor-pointer group"
            >
              <svg
                className={`w-3 h-3 text-slate-600 transition-transform duration-150 ${
                  expanded[folder.path] ? 'rotate-90' : ''
                }`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-3 h-3 text-amber-700/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                {folder.name}
              </span>
              <span className="text-[10px] text-slate-700 ml-auto">{folder.files.length}</span>
            </button>
          )}

          {/* 文件列表 */}
          {expanded[folder.path] !== false && folder.files.map(file => {
            const isActive = selectedPath === file.path;
            return (
              <div
                key={file.path}
                className={`w-full flex items-center gap-1.5 py-1 cursor-pointer transition-colors duration-100
                  ${folder.path ? 'pl-7 pr-3' : 'px-3'}
                  ${isActive
                    ? 'bg-[#CC7C5E]/08 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                  }`}
                onClick={() => onSelect(file.path)}
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0-1.125-.504-1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="text-xs truncate">{file.name}</span>
                {renderFileActions && (
                  <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">
                    {renderFileActions(file)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {footer}
    </div>
  );
}

export default TdbFileTree;
