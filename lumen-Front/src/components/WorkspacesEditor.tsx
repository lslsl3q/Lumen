/**
 * 工作区配置编辑器
 *
 * 职责：管理工作区路径列表、只读模式、文件大小限制
 * 纯渲染组件，数据来自 props
 */
import { useState } from 'react';

interface WorkspaceData {
  workspaces: string[];
  readonly_mode: boolean;
  max_file_size_mb: number;
}

interface WorkspacesEditorProps {
  data: WorkspaceData;
  onSave: (content: string) => Promise<void>;
  isSaving: boolean;
}

function WorkspacesEditor({ data, onSave, isSaving }: WorkspacesEditorProps) {
  const [workspaces, setWorkspaces] = useState<string[]>([...data.workspaces]);
  const [readonlyMode, setReadonlyMode] = useState(data.readonly_mode);
  const [maxFileSize, setMaxFileSize] = useState(data.max_file_size_mb);
  const [newPath, setNewPath] = useState('');

  const handleRemove = (index: number) => {
    setWorkspaces(prev => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    const path = newPath.trim();
    if (!path) return;
    if (workspaces.includes(path)) {
      setNewPath('');
      return;
    }
    setWorkspaces(prev => [...prev, path]);
    setNewPath('');
  };

  const handleSave = async () => {
    const newData: WorkspaceData = {
      workspaces,
      readonly_mode: readonlyMode,
      max_file_size_mb: maxFileSize,
    };
    await onSave(JSON.stringify(newData, null, 2));
  };

  // 检查是否有修改
  const hasChanges =
    JSON.stringify(workspaces) !== JSON.stringify(data.workspaces) ||
    readonlyMode !== data.readonly_mode ||
    maxFileSize !== data.max_file_size_mb;

  return (
    <div className="space-y-6">
      {/* 工作区路径列表 */}
      <section>
        <h3 className="text-sm text-slate-400 mb-3">工作区路径</h3>
        <p className="text-xs text-slate-600 mb-3">
          AI 只能访问这些目录下的文件
        </p>

        <div className="space-y-2">
          {workspaces.map((path, i) => (
            <div
              key={`${path}-${i}`}
              className="
                flex items-center justify-between
                px-4 py-2.5 rounded-lg
                bg-slate-800/40 border border-slate-700/40
              "
            >
              <span className="text-sm text-slate-200 font-mono">{path}</span>
              <button
                onClick={() => handleRemove(i)}
                className="
                  text-slate-600 hover:text-red-400
                  transition-colors duration-150 text-sm
                "
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* 添加路径 */}
        <div className="flex gap-2 mt-3">
          <input
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="D:/Projects/"
            className="
              flex-1 px-4 py-2.5 rounded-lg text-sm font-mono
              bg-slate-800/40 border border-slate-700/40
              text-slate-200 placeholder-slate-600
              focus:outline-none focus:border-amber-500/40
              transition-all duration-200
            "
          />
          <button
            onClick={handleAdd}
            disabled={!newPath.trim()}
            className="
              px-4 py-2.5 rounded-lg text-sm
              bg-amber-500/10 border border-amber-500/30 text-amber-400
              hover:bg-amber-500/20 hover:border-amber-500/50
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-all duration-200
            "
          >
            添加
          </button>
        </div>
      </section>

      {/* 其他设置 */}
      <section className="space-y-4">
        <h3 className="text-sm text-slate-400">其他设置</h3>

        {/* 只读模式 */}
        <label className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <div>
            <div className="text-sm text-slate-200">只读模式</div>
            <div className="text-xs text-slate-600">开启后 AI 只能读取文件，不能写入</div>
          </div>
          <button
            onClick={() => setReadonlyMode(!readonlyMode)}
            className={`
              relative w-10 h-5 rounded-full transition-colors duration-200
              ${readonlyMode ? 'bg-amber-500/30' : 'bg-slate-700'}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-slate-300 transition-transform duration-200
                ${readonlyMode ? 'translate-x-[20px]' : ''}
              `}
            />
          </button>
        </label>

        {/* 文件大小限制 */}
        <div className="px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <div className="text-sm text-slate-200 mb-2">单文件大小上限（MB）</div>
          <input
            type="number"
            min={1}
            max={100}
            value={maxFileSize}
            onChange={e => setMaxFileSize(Number(e.target.value))}
            className="
              w-24 px-3 py-1.5 rounded-lg text-sm
              bg-slate-900/60 border border-slate-700/40
              text-slate-200
              focus:outline-none focus:border-amber-500/40
              transition-all duration-200
            "
          />
        </div>
      </section>

      {/* 保存按钮 */}
      <div className="flex justify-end pt-4 border-t border-slate-800/40">
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="
            px-5 py-2.5 rounded-lg text-sm font-medium
            bg-amber-500/10 border border-amber-500/30 text-amber-400
            hover:bg-amber-500/20 hover:border-amber-500/50
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-200
          "
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

export default WorkspacesEditor;
