/**
 * Lumen 主题系统 — 主题加载器
 *
 * 当前内建主题使用静态 JSON import，未来可扩展为异步加载远程主题。
 */

import type { ThemeSchema } from './types';
import lumenDark from './themes/lumen-dark.json';
import lumenLight from './themes/lumen-light.json';

export const builtInThemes: ThemeSchema[] = [
  lumenDark,
  lumenLight,
] as ThemeSchema[];

export function getThemeById(id: string): ThemeSchema | undefined {
  return builtInThemes.find(t => t.id === id);
}
