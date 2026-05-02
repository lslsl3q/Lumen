/**
 * ToolTips 管理页 — 编辑 AI 工具的全局使用指南
 *
 * 两栏：工具列表（左 w-52）| 编辑区（右 flex-1）
 * 左侧紧凑导航，右侧大面积写作空间
 */
import { useState, useEffect, useCallback } from 'react';

interface ToolDef {
  description: string;
  usage_guide: string;
  parameters?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

type ToolsMap = Record<string, ToolDef>;

interface ToolTipsPageProps {
  onBack?: () => void;
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

const API_BASE = 'http://127.0.0.1:8888';

async function fetchTools(): Promise<ToolsMap> {
  const res = await fetch(`${API_BASE}/config/tools`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.parsed || {};
}

async function saveTools(tools: ToolsMap): Promise<void> {
  const res = await fetch(`${API_BASE}/config/tools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify(tools, null, 2) }),
  });
  if (!res.ok) throw new Error(`保存失败: ${res.status}`);
}

function ToolTipsPage(_props: ToolTipsPageProps) {
  const [tools, setTools] = useState<ToolsMap>({});
  const [originalGuide, setOriginalGuide] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});

  /* 加载 */
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchTools();
        setTools(data);
        const orig: Record<string, string> = {};
        for (const [name, def] of Object.entries(data)) {
          orig[name] = def.usage_guide || '';
        }
        setOriginalGuide(orig);
        setEditDrafts(orig);
        const names = Object.keys(data);
        if (names.length > 0) setSelected(names[0]);
      } catch (err) {
        console.error('加载工具失败:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  /* 编辑 */
  const handleEdit = useCallback((value: string) => {
    if (!selected) return;
    setEditDrafts(prev => ({ ...prev, [selected]: value }));
  }, [selected]);

  /* 保存单个 */
  const handleSave = useCallback(async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const updated = { ...tools };
      if (updated[selected]) {
        updated[selected] = { ...updated[selected], usage_guide: editDrafts[selected] || '' };
      }
      await saveTools(updated);
      setTools(updated);
      setOriginalGuide(prev => ({ ...prev, [selected]: editDrafts[selected] || '' }));
    } catch (err) {
      console.error('保存失败:', err);
    } finally {
      setIsSaving(false);
    }
  }, [selected, tools, editDrafts]);

  /* 恢复默认 */
  const handleReset = useCallback(() => {
    if (!selected) return;
    setEditDrafts(prev => ({ ...prev, [selected]: originalGuide[selected] || '' }));
  }, [selected, originalGuide]);

  /* Ctrl+S */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const toolNames = Object.keys(tools);
  const currentDef = selected ? tools[selected] : null;
  const currentDraft = selected ? editDrafts[selected] ?? '' : '';
  const hasChanges = selected ? (editDrafts[selected] ?? '') !== (originalGuide[selected] ?? '') : false;
  const params = currentDef?.parameters?.properties;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#1a1a18]">
      {/* ── 左栏：工具列表 ── */}
      <div className="w-52 flex-shrink-0 border-r border-[#2a2926] bg-[#171715]
        flex flex-col">
        <div className="px-4 pt-5 pb-3">
          <h2 className="text-sm font-medium text-slate-300">工具提示词</h2>
          <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
            编辑 AI 调用每个工具时的行为指南
          </p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          {toolNames.map(name => {
            const isActive = name === selected;
            const isModified = (editDrafts[name] ?? '') !== (originalGuide[name] ?? '');
            return (
              <button
                key={name}
                onClick={() => setSelected(name)}
                className={`w-full flex items-center gap-2 px-4 py-2 text-left cursor-pointer
                  transition-colors duration-100
                  ${isActive
                    ? 'bg-[#CC7C5E]/08 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-[#1f1f1c]'
                  }`}
              >
                <span className="text-xs font-mono truncate flex-1">{name}</span>
                {isModified && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CC7C5E] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 右栏：编辑区 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {currentDef ? (
          <>
            {/* 工具信息头 */}
            <div className="px-6 pt-5 pb-4 border-b border-[#2a2926]">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-base font-mono text-slate-200">{selected}</h3>
                {hasChanges && (
                  <span className="text-[10px] text-[#CC7C5E] uppercase tracking-wider">
                    未保存
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                {currentDef.description}
              </p>

              {/* 参数列表（只读参考） */}
              {params && Object.keys(params).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(params).map(([pname, pdef]) => (
                    <span key={pname} className="text-[10px] text-slate-600">
                      <span className="font-mono text-slate-500">{pname}</span>
                      <span className="text-slate-700 mx-1">:</span>
                      {pdef.description || pdef.type}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 编辑区 */}
            <div className="flex-1 flex flex-col min-h-0 p-6">
              <label className="text-[10px] uppercase tracking-widest text-slate-600 mb-2 block">
                使用指南 (usage_guide)
              </label>
              <textarea
                value={currentDraft}
                onChange={e => handleEdit(e.target.value)}
                className="flex-1 w-full bg-[#1C1B19] border border-[#2a2926] rounded-lg
                  p-4 text-sm text-slate-300 leading-relaxed
                  resize-none outline-none
                  focus:border-[#CC7C5E]/20 transition-colors
                  placeholder:text-slate-700"
                placeholder="描述 AI 应在何时、如何使用这个工具..."
                spellCheck={false}
              />

              {/* 操作栏 */}
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#2a2926]">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  className={`px-4 py-1.5 rounded-lg text-xs cursor-pointer transition-colors
                    ${hasChanges
                      ? 'bg-[#CC7C5E]/15 text-[#CC7C5E] hover:bg-[#CC7C5E]/25'
                      : 'text-slate-700 cursor-not-allowed'
                    }`}
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                {hasChanges && (
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 rounded-lg text-xs cursor-pointer
                      text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    恢复
                  </button>
                )}
                <span className="ml-auto text-[10px] text-slate-700">Ctrl+S 保存</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-slate-700">选择左侧工具开始编辑</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ToolTipsPage;
