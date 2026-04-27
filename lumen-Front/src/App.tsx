import { Component, type ReactNode, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import TitleBar from './components/TitleBar';
import CharacterList from './pages/CharacterList';
import CharacterEditor from './pages/CharacterEditor';
import PersonaList from './pages/PersonaList';
import PersonaEditor from './pages/PersonaEditor';
import WorldBookList from './pages/WorldBookList';
import WorldBookEditor from './pages/WorldBookEditor';
import SkillList from './pages/SkillList';
import SkillEditor from './pages/SkillEditor';
import AvatarManager from './pages/AvatarManager';
import ConfigList from './pages/ConfigList';
import ConfigEditor from './pages/ConfigEditor';
import TokenInspector from './pages/TokenInspector';
import KnowledgeList from './pages/KnowledgeList';
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
    <HashRouter>
      <div className="h-screen flex flex-col bg-slate-950">
        <ErrorBoundary><TitleBar /></ErrorBoundary>
        <div className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            {/* 聊天主页面 */}
            <Route path="/" element={<ErrorBoundary><ChatInterface /></ErrorBoundary>} />

            {/* 角色管理页面 */}
            <Route path="/settings/characters" element={<CharacterList />} />
            <Route path="/settings/characters/new" element={<CharacterEditor />} />
            <Route path="/settings/characters/:id" element={<CharacterEditor />} />

            {/* Persona 管理页面 */}
            <Route path="/settings/personas" element={<PersonaList />} />
            <Route path="/settings/personas/new" element={<PersonaEditor />} />
            <Route path="/settings/personas/:id" element={<PersonaEditor />} />

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

            {/* Token Inspector 页面 */}
            <Route path="/settings/token-inspector" element={<TokenInspector />} />

            {/* 知识库管理页面 */}
            <Route path="/settings/knowledge" element={<KnowledgeList />} />
          </Routes>
        </div>
      </div>

      {/* Overlay 挂载点 — 推送通知 + 浮动层 */}
      <div id="overlay-root" className="pointer-events-none fixed inset-0 z-50" />
      <PushNotification notifications={notifications} onDismiss={dismissNotification} />
    </HashRouter>
  );
}

export default App;
