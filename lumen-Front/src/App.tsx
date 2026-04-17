import { HashRouter, Routes, Route } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import CharacterList from './pages/CharacterList';
import CharacterEditor from './pages/CharacterEditor';
import PersonaList from './pages/PersonaList';
import PersonaEditor from './pages/PersonaEditor';
import ConfigList from './pages/ConfigList';
import ConfigEditor from './pages/ConfigEditor';
import PushNotification from './components/PushNotification';
import { usePush } from './hooks/usePush';

function App() {
  const { notifications, dismissNotification } = usePush();

  return (
    <HashRouter>
      <Routes>
        {/* 聊天主页面 */}
        <Route path="/" element={<ChatInterface />} />

        {/* 角色管理页面 */}
        <Route path="/settings/characters" element={<CharacterList />} />
        <Route path="/settings/characters/new" element={<CharacterEditor />} />
        <Route path="/settings/characters/:id" element={<CharacterEditor />} />

        {/* Persona 管理页面 */}
        <Route path="/settings/personas" element={<PersonaList />} />
        <Route path="/settings/personas/new" element={<PersonaEditor />} />
        <Route path="/settings/personas/:id" element={<PersonaEditor />} />

        {/* 配置管理页面 */}
        <Route path="/settings/config" element={<ConfigList />} />
        <Route path="/settings/config/:resource" element={<ConfigEditor />} />
      </Routes>

      {/* Overlay 挂载点 — 推送通知 + 未来动画特效系统 */}
      <div id="overlay-root" className="pointer-events-none fixed inset-0 z-50" />
      <PushNotification notifications={notifications} onDismiss={dismissNotification} />
    </HashRouter>
  );
}

export default App;
