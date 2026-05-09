/**
 * Lumen 主题系统 — 类型定义
 *
 * ThemeTokens: 29 个语义色 token，涵盖 Lumen 自定义变量 + Shadcn 映射。
 * render-css.ts 将每个 token 映射到对应的 CSS 变量组。
 */

export interface ThemeTokens {
  // === 主色 — 赤陶棕 accent ===
  primary: string;
  primaryDim: string;
  primaryDeep: string;
  primarySubtle: string;
  primaryForeground: string;

  // === 状态色 ===
  success: string;
  successLight: string;
  error: string;
  errorLight: string;

  // === 背景层（4 级明度梯度）===
  bgDeep: string;
  bgBase: string;
  bgSurface: string;
  bgElevated: string;

  // === 区域色（ActivityBar / SidePanel / ChatPanel）===
  bgRail: string;
  bgPanel: string;
  bgCanvas: string;

  // === 文字色（4 级对比度）===
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;

  // === 边框 ===
  border: string;
  borderSubtle: string;

  // === 发光效果 ===
  glowPrimary: string;
  glowSubtle: string;
}

export interface ThemeSchema {
  id: string;
  label: string;
  tokens: ThemeTokens;
}
