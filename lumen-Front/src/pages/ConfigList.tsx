/**
 * 配置管理列表页
 *
 * 职责：展示所有配置分类卡片，点击进入编辑
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listConfigs } from '../api/config';
import { ConfigItem } from '../types/config';
import { SettingsPageProps } from '../types/settings';

/** 配置类型的图标和颜色 */
const TYPE_META: Record<string, { icon: string; color: string }> = {
  env: { icon: '⚙', color: 'text-amber-400' },
  json: { icon: '{ }', color: 'text-teal-400' },
};

interface ConfigListProps extends SettingsPageProps {}

function ConfigList({ onBack, onNavigate }: ConfigListProps) {
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate('/'));
  const goTo = onNavigate ?? ((page: string, _params?: { id?: string; resource?: string }) => navigate(`/settings/${page}`));
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await listConfigs();
      setConfigs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div className="h-full bg-surface-deep text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* 顶栏 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => goBack()}
              className="
                px-3 py-1.5 rounded-lg text-sm text-slate-400
                hover:text-slate-200 hover:bg-slate-800/60
                transition-all duration-150
              "
            >
              &larr; 返回聊天
            </button>
            <h1 className="text-xl font-light tracking-wide">配置管理</h1>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 加载状态 */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : (
          <>
            {/* 配置卡片列表 */}
            <div className="space-y-4">
              {configs.map(config => {
                const meta = TYPE_META[config.type] || { icon: '?', color: 'text-slate-400' };
                return (
                  <div
                    key={config.name}
                    onClick={() => goTo('config-editor', { resource: config.name })}
                    className="
                      group relative p-5 rounded-xl cursor-pointer
                      bg-slate-900/60 border border-slate-800/40
                      hover:border-teal-500/30 hover:bg-slate-900/80
                      transition-all duration-200
                    "
                  >
                    <div className="flex items-center gap-4">
                      {/* 图标 */}
                      <div className={`text-2xl font-mono ${meta.color}`}>
                        {meta.icon}
                      </div>
                      {/* 信息 */}
                      <div className="flex-1">
                        <div className="text-base text-slate-200">{config.name}</div>
                        <div className="text-sm text-slate-500 mt-0.5">{config.description}</div>
                      </div>
                      {/* 箭头 */}
                      <svg
                        className="w-4 h-4 text-slate-600 group-hover:text-teal-400 transition-colors"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 其他功能入口 */}
            <div className="mt-8 pt-6 border-t border-slate-800/40">
              <h3 className="text-sm text-slate-500 mb-4">其他功能</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => window.dispatchEvent(new CustomEvent('lumen:open-knowledge'))}
                  className="
                    group p-4 rounded-xl cursor-pointer
                    bg-slate-900/60 border border-slate-800/40
                    hover:border-amber-500/30 hover:bg-slate-900/80
                    transition-all duration-200
                  "
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl text-amber-400">&#128218;</div>
                    <div>
                      <div className="text-base text-slate-200">知识库</div>
                      <div className="text-sm text-slate-500">导入文档，语义检索注入对话</div>
                    </div>
                  </div>
                </div>
                <div
                  onClick={() => goTo('skill-list')}
                  className="
                    group p-4 rounded-xl cursor-pointer
                    bg-slate-900/60 border border-slate-800/40
                    hover:border-amber-500/30 hover:bg-slate-900/80
                    transition-all duration-200
                  "
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl text-amber-400">&#9889;</div>
                    <div>
                      <div className="text-base text-slate-200">Skills 管理</div>
                      <div className="text-sm text-slate-500">定义 AI 的工作方式</div>
                    </div>
                  </div>
                </div>
                <div
                  onClick={() => goTo('avatar-manager')}
                  className="
                    group p-4 rounded-xl cursor-pointer
                    bg-slate-900/60 border border-slate-800/40
                    hover:border-amber-500/30 hover:bg-slate-900/80
                    transition-all duration-200
                  "
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">&#128444;&#65039;</div>
                    <div>
                      <div className="text-base text-slate-200">头像管理</div>
                      <div className="text-sm text-slate-500">上传和管理头像</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ConfigList;
