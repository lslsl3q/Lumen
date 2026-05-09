/**
 * Lumen 主题系统 — React Context
 *
 * 用法：
 *   1. 在 main.tsx 用 <ThemeProvider> 包裹 <App />
 *   2. 在任意组件用 const { theme, setTheme, isDark } = useTheme()
 *
 * 切换机制：
 *   - 所有主题 CSS 在首次渲染时注入 <style id="lumen-themes">
 *   - 切换只改 html[data-theme] 属性（O(1)，无重绘闪烁）
 *   - localStorage 持久化，下次打开自动恢复
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useLayoutEffect,
  type ReactNode,
} from 'react';
import type { ThemeSchema } from './types';
import { builtInThemes } from './loader';
import { renderThemeCSS } from './render-css';

const STORAGE_KEY = 'lumen-theme';
const DEFAULT_THEME = 'lumen-dark';
const STYLE_ID = 'lumen-themes';

// 预生成所有主题的 CSS（模块加载时一次性计算）
const allThemeCSS = builtInThemes.map(t => renderThemeCSS(t.id, t.tokens)).join('\n');

let cssInjected = false;

function ensureThemeCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = allThemeCSS;
  document.head.appendChild(el);
  cssInjected = true;
}

interface ThemeContextValue {
  theme: ThemeSchema;
  themes: ThemeSchema[];
  setTheme: (id: string) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentId, setCurrentId] = useState(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_THEME;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  });

  const theme = builtInThemes.find(t => t.id === currentId) || builtInThemes[0];
  const isDark = theme.id.includes('dark');

  // useLayoutEffect = 同步执行，在浏览器绘制前应用主题
  useLayoutEffect(() => {
    ensureThemeCSS();
    document.documentElement.setAttribute('data-theme', theme.id);
    localStorage.setItem(STORAGE_KEY, theme.id);
  }, [theme.id]);

  const setTheme = useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themes: builtInThemes, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
