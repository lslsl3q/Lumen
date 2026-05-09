/**
 * Lumen 主题系统 — Token → CSS 变量渲染
 *
 * 将 ThemeTokens 映射到 Lumen 自定义变量 + Shadcn 语义变量。
 * 每个主题生成 `html[data-theme="<id>"] { ... }` 选择器块，
 * 优先级高于 `:root`（element + attribute > pseudo-class）。
 */

import type { ThemeTokens } from './types';

export function renderThemeCSS(id: string, t: ThemeTokens): string {
  return `html[data-theme="${id}"] {
  /* === Lumen 自定义变量 === */
  --color-primary: ${t.primary};
  --color-primary-dim: ${t.primaryDim};
  --color-primary-deep: ${t.primaryDeep};
  --color-primary-subtle: ${t.primarySubtle};

  --color-success: ${t.success};
  --color-success-light: ${t.successLight};
  --color-error: ${t.error};
  --color-error-light: ${t.errorLight};

  --color-bg-deep: ${t.bgDeep};
  --color-bg-base: ${t.bgBase};
  --color-bg-surface: ${t.bgSurface};
  --color-bg-elevated: ${t.bgElevated};

  --color-bg-rail: ${t.bgRail};
  --color-bg-panel: ${t.bgPanel};
  --color-bg-canvas: ${t.bgCanvas};

  --color-text-primary: ${t.textPrimary};
  --color-text-secondary: ${t.textSecondary};
  --color-text-muted: ${t.textMuted};
  --color-text-dim: ${t.textDim};

  --color-border: ${t.border};
  --color-border-subtle: ${t.borderSubtle};

  --glow-primary: ${t.glowPrimary};
  --glow-subtle: ${t.glowSubtle};

  /* === Shadcn 语义变量 === */
  --background: ${t.bgDeep};
  --foreground: ${t.textPrimary};
  --card: ${t.bgBase};
  --card-foreground: ${t.textPrimary};
  --popover: ${t.bgBase};
  --popover-foreground: ${t.textPrimary};
  --primary: ${t.primary};
  --primary-foreground: ${t.primaryForeground};
  --secondary: ${t.bgSurface};
  --secondary-foreground: ${t.textPrimary};
  --muted: ${t.bgSurface};
  --muted-foreground: ${t.textSecondary};
  --accent: ${t.bgSurface};
  --accent-foreground: ${t.textPrimary};
  --destructive: ${t.error};
  --border: ${t.border};
  --input: ${t.border};
  --ring: ${t.primary};
  --chart-1: ${t.primary};
  --chart-2: ${t.textSecondary};
  --chart-3: ${t.textDim};
  --chart-4: ${t.bgElevated};
  --chart-5: ${t.bgSurface};

  --sidebar: ${t.bgBase};
  --sidebar-foreground: ${t.textPrimary};
  --sidebar-primary: ${t.primary};
  --sidebar-primary-foreground: ${t.primaryForeground};
  --sidebar-accent: ${t.bgSurface};
  --sidebar-accent-foreground: ${t.textPrimary};
  --sidebar-border: ${t.borderSubtle};
  --sidebar-ring: ${t.primary};
}`;
}
