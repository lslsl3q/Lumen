// lumen-Front/src/lib/theme/render-css.ts

import type { ThemeTokens } from "./types";
import { TOKEN_REGISTRY } from "./token-registry";

export function renderThemeCSS(id: string, t: ThemeTokens): string {
  const customVars = Object.entries(TOKEN_REGISTRY)
    .map(([key, meta]) => {
      const value = (t as unknown as Record<string, string>)[key];
      return value ? `  --${meta.cssVar}: ${value};` : "";
    })
    .filter(Boolean)
    .join("\n");

  return `html[data-theme="${id}"] {
${customVars}

  /* === Shadcn 语义变量（引用 Lumen tokens）=== */
  --background: var(--color-surface-deep);
  --foreground: var(--color-text-primary);
  --card: var(--color-surface-base);
  --card-foreground: var(--color-text-primary);
  --popover: var(--color-surface-base);
  --popover-foreground: var(--color-text-primary);
  --primary: var(--color-primary);
  --primary-foreground: var(--color-primary-foreground);
  --secondary: var(--color-surface);
  --secondary-foreground: var(--color-text-primary);
  --muted: var(--color-surface);
  --muted-foreground: var(--color-text-secondary);
  --accent: var(--color-surface);
  --accent-foreground: var(--color-text-primary);
  --destructive: var(--color-error);
  --border: var(--color-border);
  --input: var(--color-border);
  --ring: var(--color-primary);
  --chart-1: var(--color-primary);
  --chart-2: var(--color-text-secondary);
  --chart-3: var(--color-text-dim);
  --chart-4: var(--color-surface-elevated);
  --chart-5: var(--color-surface);
  --sidebar: var(--color-surface-base);
  --sidebar-foreground: var(--color-text-primary);
  --sidebar-primary: var(--color-primary);
  --sidebar-primary-foreground: var(--color-primary-foreground);
  --sidebar-accent: var(--color-surface);
  --sidebar-accent-foreground: var(--color-text-primary);
  --sidebar-border: var(--color-border-subtle);
  --sidebar-ring: var(--color-primary);
}`;
}
