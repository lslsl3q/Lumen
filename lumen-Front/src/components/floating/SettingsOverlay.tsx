/**
 * SettingsOverlay — 全屏设置覆盖层
 *
 * Portal 到 #overlay-root，左子导航 + 右内容区。
 * 替换 /settings/* 路由导航，所有设置在不离开聊天界面的情况下完成。
 */
import { createPortal } from 'react-dom';
import { useState } from 'react';

// Page 组件
import WorldBookList from '../../pages/WorldBookList';
import WorldBookEditor from '../../pages/WorldBookEditor';
import SkillList from '../../pages/SkillList';
import SkillEditor from '../../pages/SkillEditor';
import ConfigList from '../../pages/ConfigList';
import ConfigEditor from '../../pages/ConfigEditor';
import ToolTipsPage from '../../pages/ToolTipsPage';
import ThinkingClustersPage from '../../pages/ThinkingClustersPage';
import PermissionPage from '../../pages/PermissionPage';
import RerankSettingsPage from '../../pages/RerankSettingsPage';

// Section 类型
type SettingsPage =
  | 'worldbook-list' | 'worldbook-editor'
  | 'skill-list' | 'skill-editor'
  | 'config-list' | 'config-editor'
  | 'tooltips' | 'thinking-clusters' | 'permissions' | 'rerank-settings'
;

interface SettingsSection {
  page: SettingsPage;
  id?: string;         // 编辑器的目标 ID
  resource?: string;   // ConfigEditor 的 resource 参数
}

interface NavGroup {
  label: string;
  items: { page: SettingsPage; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '实体管理',
    items: [
      { page: 'worldbook-list', label: '世界书' },
      { page: 'skill-list', label: '技能' },
    ],
  },
  {
    label: '系统配置',
    items: [
      { page: 'config-list', label: '配置' },
      { page: 'tooltips', label: '工具提示词' },
      { page: 'thinking-clusters', label: '思维簇' },
      { page: 'permissions', label: '权限' },
    ],
  },
];

// 主页面集合（左侧导航高亮用）
const MAIN_PAGES = new Set(NAV_GROUPS.flatMap(g => g.items.map(i => i.page)));

interface SettingsOverlayProps {
  open: boolean;
  onClose: () => void;
  initialSection?: string;
}

export default function SettingsOverlay({ open, onClose, initialSection }: SettingsOverlayProps) {
  const [section, setSection] = useState<SettingsSection>(() => {
    if (initialSection) return { page: initialSection as SettingsPage };
    return { page: 'worldbook-list' };
  });

  if (!open) return null;

  // 导航回调：让 page 组件可以跳转
  const navigateTo = (page: string, params?: { id?: string; resource?: string }) => {
    setSection({ page: page as SettingsPage, ...params });
  };

  // 返回主列表
  const goBackToList = () => {
    const pageToSection: Record<string, SettingsPage> = {
      'worldbook-editor': 'worldbook-list',
      'skill-editor': 'skill-list',
      'config-editor': 'config-list',
    };
    const target = pageToSection[section.page] || 'persona-list';
    setSection({ page: target });
  };

  // 获取当前激活的导航项
  const activeNav = MAIN_PAGES.has(section.page) ? section.page : undefined;

  // 渲染内容
  const renderContent = () => {
    const contentNav = { onBack: onClose, onNavigate: navigateTo };

    switch (section.page) {
      case 'worldbook-list':
        return <WorldBookList {...contentNav} />;
      case 'worldbook-editor':
        return <WorldBookEditor worldBookId={section.id} onBack={goBackToList} onNavigate={navigateTo} />;
      case 'skill-list':
        return <SkillList {...contentNav} />;
      case 'skill-editor':
        return <SkillEditor skillId={section.id} onBack={goBackToList} onNavigate={navigateTo} />;
      case 'config-list':
        return <ConfigList {...contentNav} />;
      case 'config-editor':
        return <ConfigEditor resource={section.resource} onBack={goBackToList} onNavigate={navigateTo} />;
      case 'tooltips':
        return <ToolTipsPage {...contentNav} />;
      case 'thinking-clusters':
        return <ThinkingClustersPage {...contentNav} />;
      case 'permissions':
        return <PermissionPage />;
      case 'rerank-settings':
        return <RerankSettingsPage onBack={() => setSection({ page: 'config-list' })} onNavigate={navigateTo} />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-auto animate-overlay-fade-in">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-surface-deep backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 内容面板 */}
      <div className="absolute inset-4 flex flex-col rounded-xl overflow-hidden
        bg-surface-deep border border-border-subtle shadow-[0_16px_48px_rgba(0,0,0,0.5)]
        animate-overlay-content-in"
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between h-10 px-4 shrink-0 border-b border-border-default bg-surface-deep">
          <span className="text-sm font-medium text-text-primary">设置</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center
              text-text-muted hover:text-text-primary hover:bg-surface-elevated
              transition-all duration-150 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 主体：左导航 + 右内容 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左导航 */}
          <nav className="w-48 flex-shrink-0 border-r border-border-default bg-surface-deep
            flex flex-col overflow-y-auto scrollbar-lumen"
          >
            <div className="flex-1 py-3">
              {NAV_GROUPS.map(group => (
                <div key={group.label} className="mb-4">
                  <div className="px-4 mb-1.5 text-xs text-text-muted font-medium">
                    {group.label}
                  </div>
                  {group.items.map(item => (
                    <button
                      key={item.page}
                      onClick={() => setSection({ page: item.page })}
                      className={`w-full text-left px-4 py-1.5 text-sm transition-all duration-150 cursor-pointer
                        ${activeNav === item.page
                          ? 'text-primary bg-primary/8'
                          : 'text-text-secondary hover:text-text-primary hover:bg-primary-subtle'
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          {/* 右内容区 */}
          <div className="flex-1 overflow-y-auto scrollbar-lumen">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('overlay-root')!
  );
}
