import { Component, type ReactNode, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import TitleBar from './components/TitleBar';
import ModeContainer from './modes/ModeContainer';
import WorldBookList from './pages/WorldBookList';
import WorldBookEditor from './pages/WorldBookEditor';
import SkillList from './pages/SkillList';
import SkillEditor from './pages/SkillEditor';
import ConfigList from './pages/ConfigList';
import ConfigEditor from './pages/ConfigEditor';
import PermissionPage from './pages/PermissionPage';
import DebugWindowPage from './pages/DebugWindowPage';
import PushNotification from './components/PushNotification';
import FloatingLayerHost from './components/floating/FloatingLayerHost';
import { useFloatingLayers } from './components/floating/useFloatingLayers';
import { useDebugState } from './hooks/useDebugState';
import { useDebugWindow } from './hooks/useDebugWindow';
import { usePush } from './hooks/usePush';
import { TOAST_EVENT, type ToastLevel } from './utils/toast';
import { TooltipProvider } from './components/ui/tooltip';

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
    <TooltipProvider delay={300}>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </TooltipProvider>
  );
}

function DebugLayout() {
  return (
    <div className="h-screen bg-slate-950">
      <Routes>
        <Route path="/debug" element={<DebugWindowPage />} />
      </Routes>
    </div>
  );
}

function MainLayout() {
  const { notifications, addNotification, dismissNotification } = usePush();
  const floating = useFloatingLayers();
  const debug = useDebugState();
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith('/settings');

  useDebugWindow({
    debugInfo: debug.debugInfo,
    reactTrace: debug.reactTrace,
    isOpen: debug.debugMode,
    onClose: debug.toggleDebug,
  });

  // 全局禁用浏览器右键菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // 全局 toast 事件
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

  // Escape 键关闭浮动层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        floating.closeTopLayer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [floating]);

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <ErrorBoundary><TitleBar /></ErrorBoundary>
      <div className="flex-1 overflow-hidden flex flex-col">
        {isSettingsRoute ? (
          <Routes>
            <Route path="/settings/worldbooks" element={<WorldBookList />} />
            <Route path="/settings/worldbooks/:id" element={<WorldBookEditor />} />
            <Route path="/settings/skills" element={<SkillList />} />
            <Route path="/settings/skills/:id" element={<SkillEditor />} />
            <Route path="/settings/config" element={<ConfigList />} />
            <Route path="/settings/config/:resource" element={<ConfigEditor />} />
            <Route path="/settings/permissions" element={<PermissionPage />} />
          </Routes>
        ) : (
          <ModeContainer floating={floating} debug={debug} />
        )}
      </div>

      <div id="overlay-root" />
      <FloatingLayerHost floating={floating} />
      <PushNotification notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  if (location.pathname === '/debug') return <DebugLayout />;
  return <MainLayout />;
}

export default App;
