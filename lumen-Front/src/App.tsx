import { HashRouter, Routes, Route } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import CharacterList from './pages/CharacterList';
import CharacterEditor from './pages/CharacterEditor';

function App() {
  return (
    <HashRouter>
      <Routes>
        {/* 聊天主页面 */}
        <Route path="/" element={<ChatInterface />} />

        {/* 角色管理页面 */}
        <Route path="/settings/characters" element={<CharacterList />} />
        <Route path="/settings/characters/new" element={<CharacterEditor />} />
        <Route path="/settings/characters/:id" element={<CharacterEditor />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
