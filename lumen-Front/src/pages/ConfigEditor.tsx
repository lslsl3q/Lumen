/**
 * 配置编辑页
 *
 * 职责：根据配置类型切换不同的编辑组件
 * env → EnvForm（表单式）
 * tools → 只读查看（工具卡片 + 参数 Schema）
 * workspaces → WorkspacesEditor（路径管理）
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getConfig, updateConfig } from '../api/config';
import { ConfigDetail } from '../types/config';
import EnvForm from '../components/EnvForm';
import WorkspacesEditor from '../components/WorkspacesEditor';
import type { SettingsPageProps } from '../types/settings';

/** 工具定义结构（从 registry.json 解析） */
interface ToolDef {
  description: string;
  usage_guide?: string;
  parameters?: {
    type: string;
    properties?: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

interface ConfigEditorProps extends SettingsPageProps {
  resource?: string;
  onNavigate?: (page: string, params?: { resource?: string }) => void;
}

function ConfigEditor({ resource: propResource, onBack }: ConfigEditorProps) {
  const { resource: paramResource } = useParams<{ resource: string }>();
  const resource = propResource || paramResource;
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate('/settings/config'));
  const [config, setConfig] = useState<ConfigDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!resource) return;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const detail = await getConfig(resource);
        setConfig(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载配置失败');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [resource]);

  const handleSave = async (content: string) => {
    if (!resource) return;
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMsg(null);
      await updateConfig(resource, { content });
      // 刷新配置
      const detail = await getConfig(resource);
      setConfig(detail);
      setSuccessMsg('保存成功');
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full bg-surface-deep text-slate-200 flex items-center justify-center">
        <div className="text-slate-600">加载中...</div>
      </div>
    );
  }

  if (!config || !resource) {
    return (
      <div className="h-full bg-surface-deep text-slate-200 flex items-center justify-center">
        <div className="text-slate-600">配置不存在</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-deep text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={goBack}
            className="
              px-3 py-1.5 rounded-lg text-sm text-slate-400
              hover:text-slate-200 hover:bg-slate-800/60
              transition-all duration-150
            "
          >
            &larr; 配置列表
          </button>
          <h1 className="text-xl font-light tracking-wide">{config.name}</h1>
        </div>

        {/* 状态提示 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            {successMsg}
          </div>
        )}

        {/* 根据类型切换编辑器 */}
        {config.type === 'env' && (
          <EnvForm
            content={config.content}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}

        {config.type === 'json' && resource === 'tools' && (
          <ToolsViewer parsed={config.parsed as Record<string, ToolDef> | undefined} />
        )}

        {config.type === 'json' && resource === 'workspaces' && config.parsed && (
          <WorkspacesEditor
            data={config.parsed as { workspaces: string[]; readonly_mode: boolean; max_file_size_mb: number }}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}

/* ======== 工具只读查看器 ======== */

function ToolsViewer({ parsed }: { parsed?: Record<string, ToolDef> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!parsed) {
    return <div className="text-slate-600">无工具数据</div>;
  }

  const tools = Object.entries(parsed);
  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-500 mb-4">
        当前注册 {tools.length} 个工具（只读查看）
      </div>

      {tools.map(([name, def]) => (
        <div
          key={name}
          className="rounded-lg bg-slate-900/60 border border-slate-800/40 overflow-hidden"
        >
          {/* 工具头 */}
          <button
            onClick={() => toggle(name)}
            className="
              w-full flex items-center justify-between
              px-4 py-3 text-left
              hover:bg-slate-800/40 transition-all duration-150
            "
          >
            <div>
              <span className="text-sm text-teal-400 font-mono">{name}</span>
              {def.description && (
                <span className="text-xs text-slate-500 ml-3">{def.description}</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-slate-600 transition-transform ${expanded.has(name) ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 展开详情 */}
          {expanded.has(name) && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-800/40">
              {/* 使用指南 */}
              {def.usage_guide && (
                <div className="mt-3">
                  <div className="text-xs text-slate-500 mb-1">使用指南</div>
                  <div className="text-sm text-slate-400">{def.usage_guide}</div>
                </div>
              )}

              {/* 参数 */}
              {def.parameters?.properties && (
                <div>
                  <div className="text-xs text-slate-500 mb-2">参数</div>
                  <div className="space-y-2">
                    {Object.entries(def.parameters.properties).map(([paramName, paramDef]) => (
                      <div
                        key={paramName}
                        className="flex items-start gap-3 px-3 py-2 rounded bg-slate-800/30"
                      >
                        <code className="text-xs text-amber-400 font-mono shrink-0">{paramName}</code>
                        <div className="text-xs text-slate-500">
                          <span className="text-slate-400">{paramDef.type}</span>
                          {paramDef.description && (
                            <span className="ml-2">{paramDef.description}</span>
                          )}
                          {def.parameters!.required?.includes(paramName) && (
                            <span className="ml-2 text-red-400">必填</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ConfigEditor;
