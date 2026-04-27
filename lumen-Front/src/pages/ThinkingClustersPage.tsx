/**
 * 思维簇管理页 — 查看/编辑思维模块 + chains 配置
 *
 * 三栏：簇列表（左 w-48）| 模块编辑（中 flex-1）| chains 配置（右 w-72）
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from '../utils/toast';

const API_BASE = 'http://127.0.0.1:8888/thinking-clusters';

interface ClusterInfo {
  name: string;
  modules: string[];
}

interface ChainsData {
  chains: Record<string, {
    name: string;
    steps: { cluster: string; top_k: number; min_score: number }[];
    token_budget: number;
    fusion_weight_query: number;
    fusion_weight_results: number;
  }>;
}

interface ThinkingClustersPageProps {
  onBack?: () => void;
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

async function fetchTree(): Promise<ClusterInfo[]> {
  const res = await fetch(`${API_BASE}/tree`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.clusters || [];
}

async function fetchModule(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/module?path=${encodeURIComponent(path)}`);
  if (!res.ok) return '';
  const data = await res.json();
  return data.content || '';
}

async function saveModule(path: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/module`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`保存失败: ${res.status}`);
}

async function createModule(cluster: string, name: string, content: string): Promise<string> {
  const res = await fetch(`${API_BASE}/module`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cluster, name, content }),
  });
  if (!res.ok) throw new Error(`创建失败: ${res.status}`);
  const data = await res.json();
  return data.path;
}

async function deleteModule(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}/module?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
}

async function fetchChains(): Promise<{ content: string; parsed: ChainsData }> {
  const res = await fetch(`${API_BASE}/chains`);
  if (!res.ok) return { content: '{}', parsed: { chains: {} } };
  return await res.json();
}

async function saveChains(content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chains`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`保存失败: ${res.status}`);
}

async function reindex(): Promise<string> {
  const res = await fetch(`${API_BASE}/reindex`, { method: 'POST' });
  if (!res.ok) throw new Error(`索引失败: ${res.status}`);
  const data = await res.json();
  return data.message;
}

function ThinkingClustersPage(_props: ThinkingClustersPageProps) {
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [chainsContent, setChainsContent] = useState('');
  const [originalChains, setOriginalChains] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showNewModule, setShowNewModule] = useState<{ cluster: string } | null>(null);
  const [newModuleName, setNewModuleName] = useState('');
  const [tab, setTab] = useState<'modules' | 'chains'>('modules');

  /* 加载 */
  useEffect(() => {
    (async () => {
      try {
        const [treeData, chainsData] = await Promise.all([fetchTree(), fetchChains()]);
        setClusters(treeData);
        setChainsContent(chainsData.content || '{}');
        setOriginalChains(chainsData.content || '{}');
        // 自动选中第一个模块
        if (treeData.length > 0 && treeData[0].modules.length > 0) {
          const firstPath = `${treeData[0].name}/${treeData[0].modules[0]}`;
          selectModule(firstPath);
        }
      } catch (err) {
        console.error('加载思维簇失败:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const selectModule = useCallback(async (path: string) => {
    const content = await fetchModule(path);
    setSelectedPath(path);
    setEditContent(content);
    setOriginalContent(content);
  }, []);

  const handleSave = useCallback(async () => {
    if (tab === 'chains') {
      setIsSaving(true);
      try {
        await saveChains(chainsContent);
        setOriginalChains(chainsContent);
      } catch (err) {
        console.error('保存 chains 失败:', err);
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (!selectedPath) return;
    setIsSaving(true);
    try {
      await saveModule(selectedPath, editContent);
      setOriginalContent(editContent);
    } catch (err) {
      console.error('保存失败:', err);
    } finally {
      setIsSaving(false);
    }
  }, [selectedPath, editContent, chainsContent, tab]);

  const handleDelete = useCallback(async () => {
    if (!selectedPath) return;
    if (!confirm(`确定删除 ${selectedPath}？`)) return;
    try {
      await deleteModule(selectedPath);
      setSelectedPath(null);
      setEditContent('');
      setOriginalContent('');
      const treeData = await fetchTree();
      setClusters(treeData);
    } catch (err) {
      console.error('删除失败:', err);
    }
  }, [selectedPath]);

  const handleCreate = useCallback(async () => {
    if (!showNewModule || !newModuleName.trim()) return;
    try {
      const path = await createModule(showNewModule.cluster, newModuleName.trim(), '');
      setShowNewModule(null);
      setNewModuleName('');
      const treeData = await fetchTree();
      setClusters(treeData);
      await selectModule(path);
    } catch (err) {
      console.error('创建失败:', err);
    }
  }, [showNewModule, newModuleName, selectModule]);

  const handleReindex = useCallback(async () => {
    try {
      const msg = await reindex();
      toast(msg, 'error');
    } catch (err) {
      console.error('索引失败:', err);
    }
  }, []);

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

  const hasModuleChanges = editContent !== originalContent;
  const hasChainChanges = chainsContent !== originalChains;
  const selectedCluster = selectedPath ? selectedPath.split('/')[0] : null;
  const selectedFile = selectedPath ? selectedPath.split('/').slice(1).join('/') : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#1a1a18]">
      {/* ── 左栏：簇+模块树 ── */}
      <div className="w-48 flex-shrink-0 border-r border-[#2a2926] bg-[#171715] flex flex-col">
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">思维簇</h2>
            <button
              onClick={handleReindex}
              className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer transition-colors"
              title="重建向量索引"
            >
              重建索引
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-0.5">
            编辑 AI 的思维模式模块
          </p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          {clusters.map(cluster => (
            <div key={cluster.name}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-slate-600 font-medium">
                {cluster.name}
              </div>
              {cluster.modules.map(mod => {
                const fullPath = `${cluster.name}/${mod}`;
                const isActive = fullPath === selectedPath;
                return (
                  <button
                    key={mod}
                    onClick={() => selectModule(fullPath)}
                    className={`w-full text-left px-3 pl-5 py-1 text-xs cursor-pointer transition-colors duration-100
                      ${isActive
                        ? 'bg-[#CC7C5E]/08 text-slate-200'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-[#1f1f1c]'
                      }`}
                  >
                    {mod.replace('.txt', '')}
                  </button>
                );
              })}
              <button
                onClick={() => { setShowNewModule({ cluster: cluster.name }); setNewModuleName(''); }}
                className="w-full text-left px-3 pl-5 py-1 text-[10px] text-slate-700 hover:text-slate-500 cursor-pointer transition-colors"
              >
                + 新模块
              </button>
            </div>
          ))}
        </div>

        {/* Tab 切换 */}
        <div className="border-t border-[#2a2926] flex">
          <button
            onClick={() => setTab('modules')}
            className={`flex-1 py-2 text-[10px] cursor-pointer transition-colors
              ${tab === 'modules' ? 'text-slate-300 bg-[#1f1f1c]' : 'text-slate-600 hover:text-slate-400'}`}
          >
            模块
          </button>
          <button
            onClick={() => setTab('chains')}
            className={`flex-1 py-2 text-[10px] cursor-pointer transition-colors
              ${tab === 'chains' ? 'text-slate-300 bg-[#1f1f1c]' : 'text-slate-600 hover:text-slate-400'}`}
          >
            链配置
          </button>
        </div>
      </div>

      {/* ── 右栏：编辑区 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {tab === 'modules' ? (
          selectedPath ? (
            <>
              {/* 模块信息头 */}
              <div className="px-5 pt-4 pb-3 border-b border-[#2a2926]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-600 font-mono">{selectedCluster}</span>
                  <span className="text-[10px] text-slate-700">/</span>
                  <span className="text-xs font-mono text-slate-300">{selectedFile}</span>
                  {hasModuleChanges && (
                    <span className="text-[10px] text-[#CC7C5E] uppercase tracking-wider ml-2">
                      未保存
                    </span>
                  )}
                </div>
              </div>

              {/* 编辑区 */}
              <div className="flex-1 flex flex-col min-h-0 p-5">
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="flex-1 w-full bg-[#141413] border border-[#2a2926] rounded-lg
                    p-4 text-sm text-slate-300 leading-relaxed
                    resize-none outline-none font-mono
                    focus:border-[#CC7C5E]/20 transition-colors
                    placeholder:text-slate-700"
                  placeholder="输入思维模块内容..."
                  spellCheck={false}
                />

                {/* 操作栏 */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#2a2926]">
                  <button
                    onClick={handleSave}
                    disabled={!hasModuleChanges || isSaving}
                    className={`px-4 py-1.5 rounded-lg text-xs cursor-pointer transition-colors
                      ${hasModuleChanges
                        ? 'bg-[#CC7C5E]/15 text-[#CC7C5E] hover:bg-[#CC7C5E]/25'
                        : 'text-slate-700 cursor-not-allowed'
                      }`}
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 rounded-lg text-xs cursor-pointer
                      text-slate-600 hover:text-red-400 transition-colors"
                  >
                    删除
                  </button>
                  {hasModuleChanges && (
                    <button
                      onClick={() => setEditContent(originalContent)}
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
              <p className="text-xs text-slate-700">选择左侧模块开始编辑</p>
            </div>
          )
        ) : (
          <>
            {/* Chains 配置编辑 */}
            <div className="px-5 pt-4 pb-3 border-b border-[#2a2926]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-300">chains.json</span>
                {hasChainChanges && (
                  <span className="text-[10px] text-[#CC7C5E] uppercase tracking-wider ml-2">
                    未保存
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">
                定义思维链的执行顺序、每步检索参数和融合权重
              </p>
            </div>

            <div className="flex-1 flex flex-col min-h-0 p-5">
              <textarea
                value={chainsContent}
                onChange={e => setChainsContent(e.target.value)}
                className="flex-1 w-full bg-[#141413] border border-[#2a2926] rounded-lg
                  p-4 text-sm text-slate-300 leading-relaxed font-mono
                  resize-none outline-none
                  focus:border-[#CC7C5E]/20 transition-colors
                  placeholder:text-slate-700"
                placeholder='{"chains": {}}'
                spellCheck={false}
              />

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#2a2926]">
                <button
                  onClick={handleSave}
                  disabled={!hasChainChanges || isSaving}
                  className={`px-4 py-1.5 rounded-lg text-xs cursor-pointer transition-colors
                    ${hasChainChanges
                      ? 'bg-[#CC7C5E]/15 text-[#CC7C5E] hover:bg-[#CC7C5E]/25'
                      : 'text-slate-700 cursor-not-allowed'
                    }`}
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                {hasChainChanges && (
                  <button
                    onClick={() => setChainsContent(originalChains)}
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
        )}
      </div>

      {/* 新建模块弹窗 */}
      {showNewModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#1f1f1c] border border-[#2a2926] rounded-lg p-5 w-80">
            <h3 className="text-sm text-slate-300 mb-3">
              新建模块 — {showNewModule.cluster}
            </h3>
            <input
              value={newModuleName}
              onChange={e => setNewModuleName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="模块名称（自动加 .txt）"
              className="w-full px-3 py-2 bg-[#141413] border border-[#2a2926] rounded-lg
                text-sm text-slate-300 outline-none focus:border-[#CC7C5E]/20
                placeholder:text-slate-700 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewModule(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newModuleName.trim()}
                className="px-3 py-1.5 rounded-lg text-xs bg-[#CC7C5E]/15 text-[#CC7C5E]
                  hover:bg-[#CC7C5E]/25 cursor-pointer transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThinkingClustersPage;
