/**
 * listNavigation — 侧面板列表键盘导航工具
 *
 * 用法：列表容器 onKeyDown={handleListKeyDown}，
 * 列表项加 data-nav-item tabIndex={0}
 */

export const navItemClass = `focus-visible:outline-none focus-visible:ring-1
  focus-visible:ring-amber-400/30 focus-visible:bg-slate-800/30`;

export function handleListKeyDown(e: React.KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

  const items = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-nav-item]');
  if (items.length === 0) return;

  const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);

  e.preventDefault();
  if (e.key === 'ArrowDown') {
    items[(idx + 1) % items.length]?.focus();
  } else {
    items[(idx - 1 + items.length) % items.length]?.focus();
  }
}
