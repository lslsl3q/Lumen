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
import AvatarManager from '../../pages/AvatarManager';
import ConfigList from '../../pages/ConfigList';
import ConfigEditor from '../../pages/ConfigEditor';
import ToolTipsPage from '../../pages/ToolTipsPage';
import ThinkingClustersPage from '../../pages/ThinkingClustersPage';

// Section 类型
type SettingsPage =
  | 'worldbook-list' | 'worldbook-editor'
  | 'skill-list' | 'skill-editor'
  | 'avatar-manager'
  | 'config-list' | 'config-editor'
  | 'tooltips' | 'thinking-clusters'
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
      { page: 'avatar-manager', label: '头像' },
    ],
  },
  {
    label: '系统配置',
    items: [
      { page: 'config-list', label: '配置' },
      { page: 'tooltips', label: '工具提示词' },
      { page: 'thinking-clusters', label: '思维簇' },
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
      case 'avatar-manager':
        return <AvatarManager {...contentNav} />;
      case 'config-list':
        return <ConfigList {...contentNav} />;
      case 'config-editor':
        return <ConfigEditor resource={section.resource} onBack={goBackToList} onNavigate={navigateTo} />;
      case 'tooltips':
        return <ToolTipsPage {...contentNav} />;
      case 'thinking-clusters':
        return <ThinkingClustersPage {...contentNav} />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-auto animate-overlay-fade-in">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 内容面板 */}
      <div className="absolute inset-4 flex rounded-xl overflow-hidden
        bg-slate-900/98 border border-slate-700/40 shadow-[0_16px_48px_rgba(0,0,0,0.5)]
        animate-overlay-content-in"
      >
        {/* 左导航 */}
        <nav className="w-56 flex-shrink-0 border-r border-slate-800/40 bg-slate-950/40
          flex flex-col overflow-y-auto scrollbar-lumen"
        >
          {/* 顶部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/40">
            <span className="text-sm font-medium text-slate-300 font-display">设置</span>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center
                text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
                transition-all duration-150 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 导航分组 */}
          <div className="flex-1 py-3">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="mb-4">
                <div className="px-5 mb-1.5 text-[10px] uppercase tracking-widest text-slate-600 font-medium">
                  {group.label}
                </div>
                {group.items.map(item => (
                  <button
                    key={item.page}
                    onClick={() => setSection({ page: item.page })}
                    className={`w-full text-left px-5 py-2 text-sm transition-all duration-150 cursor-pointer
                      ${activeNav === item.page
                        ? 'text-amber-400 bg-amber-500/8 rounded mr-2'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
    </div>,
    document.getElementById('overlay-root')!
  );
}
