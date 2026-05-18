/**
 * Lumen 主题系统 — Token 注册表
 *
 * 每个 token 的元信息：类型、CSS 变量名、描述。
 * 用于类型安全、文档生成、AI 辅助配置。
 */

export type TokenType = "color" | "length" | "shadow" | "time" | "easing" | "fontSize";

export interface TokenMeta {
  type: TokenType;
  cssVar: string;
  description: string;
}

export const TOKEN_REGISTRY: Record<keyof import("./types").ThemeTokens, TokenMeta> = {
  primary:            { type: "color",   cssVar: "color-primary",             description: "主交互色，按钮/选中/高亮" },
  primaryDim:         { type: "color",   cssVar: "color-primary-dim",         description: "深一级 accent" },
  primaryDeep:        { type: "color",   cssVar: "color-primary-deep",        description: "最深 accent" },
  primarySubtle:      { type: "color",   cssVar: "color-primary-subtle",      description: "极淡 accent 背景" },
  primaryForeground:  { type: "color",   cssVar: "color-primary-foreground",  description: "accent 色上文字" },
  success:            { type: "color",   cssVar: "color-success",             description: "成功状态色" },
  successLight:       { type: "color",   cssVar: "color-success-light",       description: "成功浅色" },
  error:              { type: "color",   cssVar: "color-error",               description: "错误状态色" },
  errorLight:         { type: "color",   cssVar: "color-error-light",         description: "错误浅色" },
  warning:            { type: "color",   cssVar: "color-warning",             description: "警告状态色" },
  surfaceDeep:        { type: "color",   cssVar: "color-surface-deep",        description: "最深背景，导航栏/ActivityBar" },
  surfaceBase:        { type: "color",   cssVar: "color-surface-base",        description: "标准背景，卡片/面板" },
  surface:            { type: "color",   cssVar: "color-surface",             description: "表面层背景" },
  surfaceElevated:    { type: "color",   cssVar: "color-surface-elevated",    description: "提升层，输入框/弹窗" },
  surfaceRail:        { type: "color",   cssVar: "color-surface-rail",        description: "ActivityBar 背景" },
  surfacePanel:       { type: "color",   cssVar: "color-surface-panel",       description: "侧栏面板背景" },
  surfaceCanvas:      { type: "color",   cssVar: "color-surface-canvas",      description: "内容区域背景" },
  textPrimary:        { type: "color",   cssVar: "color-text-primary",        description: "主文字色" },
  textSecondary:      { type: "color",   cssVar: "color-text-secondary",      description: "次要文字色" },
  textMuted:          { type: "color",   cssVar: "color-text-muted",          description: "弱化文字色" },
  textDim:            { type: "color",   cssVar: "color-text-dim",            description: "最弱文字，占位符/提示" },
  borderDefault:      { type: "color",   cssVar: "color-border",              description: "默认边框色" },
  borderSubtle:       { type: "color",   cssVar: "color-border-subtle",       description: "淡边框色" },
  surfaceTint:        { type: "color",   cssVar: "color-surface-tint",        description: "微弱表面叠加，Act 背景" },
  hoverSurface:       { type: "color",   cssVar: "color-hover-surface",       description: "hover 背景色" },
  interactiveHover:   { type: "color",   cssVar: "color-interactive-hover",   description: "交互元素 hover 背景" },
  ghostText:          { type: "color",   cssVar: "color-ghost-text",          description: "AI 续写预览文字色" },
  selectionBg:        { type: "color",   cssVar: "color-selection-bg",        description: "文字选中高亮背景" },
  glowPrimary:        { type: "color",   cssVar: "glow-primary",              description: "主发光效果色" },
  glowSubtle:         { type: "color",   cssVar: "glow-subtle",               description: "微发光效果色" },
  spacingTight:       { type: "length",  cssVar: "spacing-tight",             description: "紧凑间距 4px" },
  spacingNormal:      { type: "length",  cssVar: "spacing-normal",            description: "标准间距 8px" },
  spacingRelaxed:     { type: "length",  cssVar: "spacing-relaxed",           description: "舒适间距 16px" },
  spacingSpacious:    { type: "length",  cssVar: "spacing-spacious",          description: "大间距 24px" },
  shadowSubtle:       { type: "shadow",  cssVar: "shadow-subtle",             description: "微弱阴影，列表项" },
  shadowCard:         { type: "shadow",  cssVar: "shadow-card",               description: "标准卡片阴影" },
  shadowModal:        { type: "shadow",  cssVar: "shadow-modal",              description: "弹窗阴影" },
  shadowDeep:         { type: "shadow",  cssVar: "shadow-deep",               description: "深层阴影，浮层/overlay" },
  radiusSm:           { type: "length",  cssVar: "radius-sm",                 description: "小圆角 4px" },
  radiusMd:           { type: "length",  cssVar: "radius-md",                 description: "中圆角 8px" },
  radiusLg:           { type: "length",  cssVar: "radius-lg",                 description: "大圆角 12px" },
  radiusFull:         { type: "length",  cssVar: "radius-full",               description: "圆形 9999px" },
  blurSubtle:         { type: "length",  cssVar: "blur-subtle",               description: "微模糊 4px" },
  blurOverlay:        { type: "length",  cssVar: "blur-overlay",              description: "遮罩模糊 8px" },
  durationInstant:    { type: "time",    cssVar: "duration-instant",          description: "瞬时 75ms，微交互" },
  durationFast:       { type: "time",    cssVar: "duration-fast",             description: "快速 150ms，hover 过渡" },
  durationNormal:     { type: "time",    cssVar: "duration-normal",           description: "标准 250ms，面板展开" },
  durationSlow:       { type: "time",    cssVar: "duration-slow",             description: "慢速 400ms，弹窗入场" },
  easeDefault:        { type: "easing",  cssVar: "ease-default",              description: "标准缓动" },
  easeSpring:         { type: "easing",  cssVar: "ease-spring",               description: "弹性缓动" },
  easeDecelerate:     { type: "easing",  cssVar: "ease-decelerate",           description: "减速缓动" },
  textXs:             { type: "fontSize", cssVar: "text-xs",                  description: "极小文字 11px" },
  textSm:             { type: "fontSize", cssVar: "text-sm",                  description: "小文字 13px" },
  textBase:           { type: "fontSize", cssVar: "text-base",                description: "正文 15px" },
  textLg:             { type: "fontSize", cssVar: "text-lg",                  description: "大正文 17px" },
  textXl:             { type: "fontSize", cssVar: "text-xl",                  description: "小标题 20px" },
  text2xl:            { type: "fontSize", cssVar: "text-2xl",                 description: "标题 24px" },
};

export const TOKEN_NAMES = Object.keys(TOKEN_REGISTRY) as (keyof import("./types").ThemeTokens)[];
