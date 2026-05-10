/**
 * 配置管理列表页
 *
 * 职责：展示所有配置文件和服务的紧凑列表，点击进入编辑/管理
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listConfigs } from '../api/config';
import { ConfigItem } from '../types/config';
import { SettingsPageProps } from '../types/settings';
import { Separator } from '../components/ui/separator';

interface ConfigListProps extends SettingsPageProps {}

function ConfigList({ onNavigate }: ConfigListProps) {
  const navigate = useNavigate();
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

  const ArrowIcon = () => (
    <svg className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="px-4 pt-5 pb-1.5 text-xs text-text-muted font-medium select-none">
      {children}
    </div>
  );

  const Row = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-elevated transition-colors duration-100"
    >
      {children}
    </div>
  );

  return (
    <div className="h-full bg-surface-deep text-text-primary overflow-y-auto scrollbar-lumen">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* 标题 */}
        <h1 className="text-lg font-medium text-text-primary mb-4">配置管理</h1>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 加载状态 */}
        {isLoading ? (
          <div className="text-center py-16 text-text-muted">加载中...</div>
        ) : (
          <div className="border border-border-default rounded-lg overflow-hidden bg-surface-panel">
            {/* 配置文件分组 */}
            <SectionHeader>配置文件</SectionHeader>

            {configs.map((config, i) => (
              <div key={config.name}>
                {i > 0 && <Separator />}
                <Row onClick={() => goTo('config-editor', { resource: config.name })}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-text-primary">{config.name}</span>
                    {config.description && (
                      <span className="text-xs text-text-muted ml-3">{config.description}</span>
                    )}
                  </div>
                  <ArrowIcon />
                </Row>
              </div>
            ))}

            {/* 服务分组 */}
            <Separator />
            <SectionHeader>服务</SectionHeader>

            <Row onClick={() => goTo('rerank-settings')}>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-text-primary">重排序服务</span>
                <span className="text-xs text-text-muted ml-3">搜索结果二次排序</span>
              </div>
              <ArrowIcon />
            </Row>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfigList;
