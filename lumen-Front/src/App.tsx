import { Component, type ReactNode, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import TitleBar from './components/TitleBar';
import WorldBookList from './pages/WorldBookList';
import WorldBookEditor from './pages/WorldBookEditor';
import SkillList from './pages/SkillList';
import SkillEditor from './pages/SkillEditor';
import AvatarManager from './pages/AvatarManager';
import ConfigList from './pages/ConfigList';
import ConfigEditor from './pages/ConfigEditor';
import DebugWindowPage from './pages/DebugWindowPage';
import PushNotification from './components/PushNotification';
import { usePush } from './hooks/usePush';
import { TOAST_EVENT, type ToastLevel } from './utils/toast';

interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
          <div className="text-center space-y-2">
            <p>组件加载失败</p>
            <p className="text-xs text-slate-600 font-mono">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

/** 调试窗口：无自定义 TitleBar，仅原生标题栏 + 内容 */
function DebugLayout() {
  return (
    <div className="h-screen bg-slate-950">
      <Routes>
        <Route path="/debug" element={<DebugWindowPage />} />
      </Routes>
    </div>
  );
}

/** 主窗口：完整布局 */
function MainLayout() {
  const { notifications, addNotification, dismissNotification } = usePush();

  // 全局禁用浏览器右键菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // 监听全局 toast 事件 → 转为 PushNotification 显示
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, level } = (e as CustomEvent<{ message: string; level: ToastLevel }>).detail;
      addNotification({
        type: 'system',
        title: level === 'error' ? '错误' : level === 'success' ? '成功' : '提示',
        body: message,
        level,
        timestamp: new Date().toISOString(),
      });
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [addNotification]);

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <ErrorBoundary><TitleBar /></ErrorBoundary>
      <div className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          {/* 聊天主页面 */}
          <Route path="/" element={<ErrorBoundary><ChatInterface /></ErrorBoundary>} />

          {/* 世界书管理页面 */}
          <Route path="/settings/worldbooks" element={<WorldBookList />} />
          <Route path="/settings/worldbooks/:id" element={<WorldBookEditor />} />

          {/* Skills 管理页面 */}
          <Route path="/settings/skills" element={<SkillList />} />
          <Route path="/settings/skills/:id" element={<SkillEditor />} />

          {/* 头像管理页面 */}
          <Route path="/settings/avatars" element={<AvatarManager />} />

          {/* 配置管理页面 */}
          <Route path="/settings/config" element={<ConfigList />} />
          <Route path="/settings/config/:resource" element={<ConfigEditor />} />
        </Routes>
      </div>

      {/* Overlay 挂载点 — 推送通知 + 浮动层 */}
      <div id="overlay-root" className="pointer-events-none fixed inset-0 z-50" />
      <PushNotification notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}

/** 根据路由分流：debug 走精简布局，其他走主布局 */
function AppContent() {
  const location = useLocation();
  if (location.pathname === '/debug') return <DebugLayout />;
  return <MainLayout />;
}

export default App;
