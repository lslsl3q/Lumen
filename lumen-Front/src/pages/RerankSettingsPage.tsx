/**
 * RerankSettingsPage — 重排序服务管理
 *
 * 多服务商 CRUD + 全局开关 + 高级参数 + 测试连接
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from '../utils/toast';
import {
  getRerankStatus,
  getProviders,
  addProvider,
  deleteProvider,
  setActiveProvider,
  updateSettings,
  testConnection,
  type Provider,
  type RerankStatus,
  type TestResult,
} from '../api/rerank';

interface RerankSettingsPageProps {
  onBack?: () => void;
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

const EMPTY_FORM = {
  name: '',
  api_url: '',
  api_key: '',
  model: 'BAAI/bge-reranker-v2-m3',
  max_doc_chars: 0,
};

export default function RerankSettingsPage(_props: RerankSettingsPageProps) {
  const [status, setStatus] = useState<RerankStatus | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ ...EMPTY_FORM });
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ── 初始加载 ── */
  const loadData = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([getRerankStatus(), getProviders()]);
      setStatus(s);
      setProviders(p);
    } catch (err) {
      console.error('加载重排设置失败:', err);
      toast('加载重排设置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── 切换启用 ── */
  const handleToggleEnabled = useCallback(async () => {
    if (!status) return;
    const next = !status.enabled;
    try {
      await updateSettings({ enabled: next });
      setStatus(prev => prev ? { ...prev, enabled: next } : prev);
      toast(next ? '已启用重排序' : '已禁用重排序');
    } catch (err) {
      console.error('切换失败:', err);
      toast('切换失败', 'error');
    }
  }, [status]);

  /* ── 切换活跃服务商 ── */
  const handleSetActive = useCallback(async (providerId: string) => {
    try {
      await setActiveProvider(providerId);
      setStatus(prev => prev ? { ...prev, active_provider_id: providerId } : prev);
      toast('已切换活跃服务商');
    } catch (err) {
      console.error('切换失败:', err);
      toast('切换服务商失败', 'error');
    }
  }, []);

  /* ── 删除服务商 ── */
  const handleDelete = useCallback(async (provider: Provider) => {
    if (!confirm(`确定删除「${provider.name}」？`)) return;
    try {
      await deleteProvider(provider.id);
      setProviders(prev => prev.filter(p => p.id !== provider.id));
      if (status?.active_provider_id === provider.id) {
        setStatus(prev => prev ? { ...prev, active_provider_id: '' } : prev);
      }
      toast(`已删除「${provider.name}」`);
    } catch (err) {
      console.error('删除失败:', err);
      toast('删除失败', 'error');
    }
  }, [status]);

  /* ── 添加服务商 ── */
  const handleAdd = useCallback(async () => {
    if (!newProvider.name.trim() || !newProvider.api_url.trim() || !newProvider.api_key.trim()) {
      toast('请填写名称、URL 和 API Key', 'warning');
      return;
    }
    try {
      const created = await addProvider({
        name: newProvider.name.trim(),
        api_url: newProvider.api_url.trim(),
        api_key: newProvider.api_key.trim(),
        model: newProvider.model.trim() || 'BAAI/bge-reranker-v2-m3',
        max_doc_chars: newProvider.max_doc_chars,
      });
      setProviders(prev => [...prev, created]);
      setShowAddForm(false);
      setNewProvider({ ...EMPTY_FORM });
      toast(`已添加「${created.name}」`);
    } catch (err) {
      console.error('添加失败:', err);
      toast('添加服务商失败', 'error');
    }
  }, [newProvider]);

  /* ── 测试连接 ── */
  const handleTest = useCallback(async (providerId?: string) => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await testConnection(providerId);
      setTestResult(result);
      if (result.success) {
        toast(`连接成功！延迟 ${result.latency_ms}ms`);
      } else {
        toast(result.error || '测试失败', 'error');
      }
    } catch (err) {
      console.error('测试失败:', err);
      toast('测试请求失败', 'error');
    } finally {
      setTestLoading(false);
    }
  }, []);

  /* ── 更新高级参数 ── */
  const handleSettingChange = useCallback(async (field: 'top_k' | 'min_score', value: number) => {
    try {
      await updateSettings({ [field]: value });
      setStatus(prev => prev ? { ...prev, [field]: value } : prev);
    } catch (err) {
      console.error('更新参数失败:', err);
      toast('更新参数失败', 'error');
    }
  }, []);

  /* ── 渲染 ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-muted">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-deep text-text-primary overflow-y-auto scrollbar-lumen">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

        {/* 标题 + 返回 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={_props.onBack}
              className="px-2 py-1 rounded text-sm text-text-secondary
                hover:text-text-primary hover:bg-surface-elevated
                transition-colors duration-150 cursor-pointer"
            >
              &larr; 配置管理
            </button>
            <h1 className="text-lg font-medium text-text-primary">重排序服务</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">启用重排序</span>
            <button
              onClick={handleToggleEnabled}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer
                ${status?.enabled ? 'bg-primary' : 'bg-zinc-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200
                  ${status?.enabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>

        {/* 服务商列表 */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-3">已配置的服务商</h2>

          {providers.length === 0 ? (
            <div className="text-sm text-text-muted py-4 text-center bg-primary-subtle rounded-lg border border-border-subtle">
              暂无服务商，点击下方添加
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map(provider => {
                const isActive = status?.active_provider_id === provider.id;
                return (
                  <div
                    key={provider.id}
                    onClick={() => handleSetActive(provider.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all duration-150
                      ${isActive
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border-default bg-surface-elevated hover:bg-primary-subtle'
                      }`}
                  >
                    {/* 活跃指示器 */}
                    <span
                      className={`w-2 h-2 rounded-full shrink-0
                        ${isActive ? 'bg-primary' : 'bg-slate-600'}`}
                    />

                    {/* 服务商信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{provider.name}</span>
                        {isActive && (
                          <span className="text-[10px] text-primary/80 uppercase tracking-wider">活跃</span>
                        )}
                      </div>
                      <span className="text-xs text-text-muted truncate block">{provider.api_url}</span>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleTest(provider.id); }}
                        disabled={testLoading}
                        className="px-2.5 py-1 rounded text-xs bg-surface-elevated hover:bg-zinc-700
                          text-text-secondary hover:text-text-primary transition-colors cursor-pointer
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testLoading ? '...' : '测试'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(provider); }}
                        className="px-2 py-1 rounded text-xs text-text-muted hover:text-red-400
                          hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 添加服务商 */}
        <section>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-2.5 rounded-lg border border-dashed border-border-default
                text-sm text-text-muted hover:text-text-primary hover:border-slate-600
                transition-colors cursor-pointer"
            >
              + 添加新服务商
            </button>
          ) : (
            <div className="bg-surface-elevated border border-border-default rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-text-primary">添加服务商</h3>

              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
                <label className="text-xs text-text-muted text-right">名称</label>
                <input
                  value={newProvider.name}
                  onChange={e => setNewProvider(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：硅基流动"
                  className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                    text-text-primary outline-none focus:border-primary/40 placeholder:text-text-muted
                    transition-colors"
                />

                <label className="text-xs text-text-muted text-right">URL</label>
                <input
                  value={newProvider.api_url}
                  onChange={e => setNewProvider(prev => ({ ...prev, api_url: e.target.value }))}
                  placeholder="https://api.siliconflow.cn/v1/rerank"
                  className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                    text-text-primary outline-none focus:border-primary/40 placeholder:text-text-muted
                    transition-colors"
                />

                <label className="text-xs text-text-muted text-right">Key</label>
                <input
                  type="password"
                  value={newProvider.api_key}
                  onChange={e => setNewProvider(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="sk-..."
                  className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                    text-text-primary outline-none focus:border-primary/40 placeholder:text-text-muted
                    transition-colors"
                />

                <label className="text-xs text-text-muted text-right">模型</label>
                <input
                  value={newProvider.model}
                  onChange={e => setNewProvider(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="BAAI/bge-reranker-v2-m3"
                  className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                    text-text-primary outline-none focus:border-primary/40 placeholder:text-text-muted
                    transition-colors"
                />

                <label className="text-xs text-text-muted text-right">文档字符上限</label>
                <input
                  type="number"
                  value={newProvider.max_doc_chars}
                  onChange={e => setNewProvider(prev => ({ ...prev, max_doc_chars: Number(e.target.value) }))}
                  placeholder="0 = 不限制"
                  className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                    text-text-primary outline-none focus:border-primary/40 placeholder:text-text-muted
                    transition-colors w-32"
                />
                <span className="text-[10px] text-text-muted col-start-2">0 = 不限制</span>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setShowAddForm(false); setNewProvider({ ...EMPTY_FORM }); }}
                  className="px-3 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary
                    bg-surface-elevated hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleAdd}
                  className="px-3 py-1.5 rounded text-sm bg-primary hover:bg-primary
                    text-white transition-colors cursor-pointer"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 高级参数 */}
        <section>
          <h2 className="text-sm font-medium text-text-secondary mb-3">高级参数</h2>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
            <label className="text-xs text-text-muted text-right">Top K</label>
            <input
              type="number"
              value={status?.top_k ?? 10}
              onChange={e => handleSettingChange('top_k', Number(e.target.value))}
              className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                text-text-primary outline-none focus:border-primary/40 transition-colors w-32"
            />

            <label className="text-xs text-text-muted text-right">最低分数</label>
            <input
              type="number"
              step={0.01}
              value={status?.min_score ?? 0.3}
              onChange={e => handleSettingChange('min_score', Number(e.target.value))}
              className="bg-surface-elevated/50 border border-border-subtle rounded px-3 py-1.5 text-sm
                text-text-primary outline-none focus:border-primary/40 transition-colors w-32"
            />
          </div>
        </section>

        {/* 测试结果 */}
        {testResult && (
          <section>
            <h2 className="text-sm font-medium text-text-secondary mb-3">测试结果</h2>
            <div className="bg-surface-elevated border border-border-default rounded-lg p-4 space-y-2">
              {testResult.success ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-sm text-text-primary">
                      连接成功！延迟 {testResult.latency_ms}ms
                    </span>
                  </div>
                  {testResult.results && testResult.results.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {testResult.results.map((r, i) => (
                        <div key={i} className="text-xs text-text-secondary font-mono">
                          <span className="text-text-muted">文档 {r.index}</span>{' '}
                          <span className="text-text-primary">{r.relevance_score.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-sm text-red-300">
                    {testResult.error || '连接失败'}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
