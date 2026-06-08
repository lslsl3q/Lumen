/**
 * Lumen 主题系统 — 类型定义
 *
 * ThemeTokens: 52 个 token，涵盖 5 层（色/间距/效果/动画/排版）。
 * render-css.ts 将每个 token 映射到对应的 CSS 变量组。
 */

export interface ThemeTokens {
  // === 主色 accent ===
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
  warning: string;

  // === 背景层（7 级）===
  surfaceDeep: string;
  surfaceBase: string;
  surface: string;
  surfaceElevated: string;
  surfaceRail: string;
  surfacePanel: string;
  surfaceCanvas: string;

  // === 文字色（4 级）===
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;

  // === 边框 ===
  borderDefault: string;
  borderSubtle: string;

  // === 交互层 ===
  surfaceTint: string;
  hoverSurface: string;
  interactiveHover: string;
  ghostText: string;
  selectionBg: string;

  // === 发光效果 ===
  glowPrimary: string;
  glowSubtle: string;

  // === 组件专属：SceneBeat ===
  beatSurface: string;
  beatSettingsSurface: string;

  // === 间距（4 级）===
  spacingTight: string;
  spacingNormal: string;
  spacingRelaxed: string;
  spacingSpacious: string;

  // === 阴影（4 级）===
  shadowSubtle: string;
  shadowCard: string;
  shadowModal: string;
  shadowDeep: string;

  // === 圆角（4 级）===
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusFull: string;

  // === 模糊（2 级）===
  blurSubtle: string;
  blurOverlay: string;

  // === 动画时长（4 级）===
  durationInstant: string;
  durationFast: string;
  durationNormal: string;
  durationSlow: string;

  // === 缓动函数（3 个）===
  easeDefault: string;
  easeSpring: string;
  easeDecelerate: string;

  // === 排版（6 级）===
  textXs: string;
  textSm: string;
  textBase: string;
  textLg: string;
  textXl: string;
  text2xl: string;
}

export interface ThemeSchema {
  id: string;
  label: string;
  tokens: ThemeTokens;
}
