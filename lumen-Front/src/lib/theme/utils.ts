/**
 * Lumen 主题系统 — 工具函数
 *
 * Token 名称转换、CSS 覆盖生成、动态主题注入。
 */

import { TOKEN_REGISTRY } from "./token-registry";

// Whitelist of safe CSS value characters — blocks CSS breakout attempts
const SAFE_CSS_VALUE_RE = /^[#0-9a-zA-Z\s(),.\/%\-]+$/;

function sanitizeCSSValue(value: string): string {
  if (!SAFE_CSS_VALUE_RE.test(value)) {
    console.warn(`[theme] Rejected unsafe CSS value: ${value}`);
    return "";
  }
  return value;
}

/**
 * 将 token key 转为 CSS 变量名
 * @example "primaryDim" → "color-primary-dim"
 */
export function toCssVarName(key: string): string {
  const meta = TOKEN_REGISTRY[key as keyof typeof TOKEN_REGISTRY];
  if (meta) return meta.cssVar;
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * 构建覆盖 CSS（用于 AI 动态主题）
 * @example { primary: "#ff0000" } → ":root { --color-primary: #ff0000; }"
 */
export function buildOverrideCSS(overrides: Record<string, string>): string {
  if (Object.keys(overrides).length === 0) return "";
  const lines = Object.entries(overrides)
    .filter(([, value]) => sanitizeCSSValue(value) !== "")
    .map(([key, value]) => `  --${toCssVarName(key)}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}`;
}

/**
 * 注入 AI 动态主题样式
 */
export function injectAIThemeStyle(overrides: Record<string, string>): void {
  const css = buildOverrideCSS(overrides);
  let style = document.getElementById("ai-dynamic-theme") as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = "ai-dynamic-theme";
    document.head.appendChild(style);
  }
  style.textContent = css;
}

/**
 * 移除 AI 动态主题样式
 */
export function removeAIThemeStyle(): void {
  document.getElementById("ai-dynamic-theme")?.remove();
}
