# Lumen Design Token 系统 — 完整设计规范

> **状态**: 待实施
> **日期**: 2026-05-09
> **范围**: 前端 Token 体系 + 组件迁移 + AI 主题工具 + 实时推送 + 持久化

---

## 1. 目标

将 Lumen 前端从"硬编码样式"升级为"完全由 Design Token 驱动的动态视觉系统"：

- **5 层 token**（颜色/间距/效果/动画/排版）覆盖 90% 以上视觉属性
- **Tailwind v4 @theme 桥接**，组件使用语义短类名（`bg-primary` 而非 `bg-[var(--color-primary)]`）
- **AI 可实时控制**，通过工具生成/切换/微调主题
- **用户自定义主题持久化**，重启不丢失

效果系统（动态发光/失真/动画预设）不在本次范围，作为独立 spec 后续迭代。

---

## 2. 架构总览

```
主题 JSON（source of truth，~52 个 token）
  ↓ render-css.ts（构建时：JSON → CSS 变量）
html[data-theme="lumen-dark"] { --color-primary: #CC7C5E; ... }
  ↓
三个并行通道：
  ├── @theme 注册    → Tailwind 语义类名（bg-primary, p-tight, shadow-card）
  ├── Shadcn 映射    → Shadcn 组件自动跟随（--primary, --background, --ring）
  └── 运行时覆盖层   → SSE 推送 → <style id="ai-dynamic-theme"> 注入
  ↓
组件（用短类名）
```

---

## 3. Token 分类体系

### 3.1 颜色层（~25 个 token）

| JSON key | CSS 变量 | Tailwind 类名 | 用途 |
|----------|----------|---------------|------|
| `primary` | `--color-primary` | `bg-primary`, `text-primary` | 主交互色 |
| `primaryDim` | `--color-primary-dim` | `text-primary-dim` | 深一级 accent |
| `primaryDeep` | `--color-primary-deep` | `text-primary-deep` | 最深 accent |
| `primarySubtle` | `--color-primary-subtle` | `bg-primary-subtle` | 极淡 accent 背景 |
| `primaryForeground` | `--color-primary-foreground` | `text-primary-foreground` | accent 上文字 |
| `success` | `--color-success` | `text-success` | 成功状态 |
| `successLight` | `--color-success-light` | `text-success-light` | 成功浅色 |
| `error` | `--color-error` | `text-error` | 错误状态 |
| `errorLight` | `--color-error-light` | `text-error-light` | 错误浅色 |
| `surfaceDeep` | `--color-surface-deep` | `bg-surface-deep` | 最深背景 |
| `surfaceBase` | `--color-surface-base` | `bg-surface-base` | 标准背景 |
| `surface` | `--color-surface` | `bg-surface` | 表面层 |
| `surfaceElevated` | `--color-surface-elevated` | `bg-surface-elevated` | 提升层 |
| `surfaceRail` | `--color-surface-rail` | `bg-surface-rail` | ActivityBar |
| `surfacePanel` | `--color-surface-panel` | `bg-surface-panel` | 侧栏面板 |
| `surfaceCanvas` | `--color-surface-canvas` | `bg-surface-canvas` | 内容区域 |
| `textPrimary` | `--color-text-primary` | `text-text-primary` | 主文字 |
| `textSecondary` | `--color-text-secondary` | `text-text-secondary` | 次要文字 |
| `textMuted` | `--color-text-muted` | `text-text-muted` | 弱化文字 |
| `textDim` | `--color-text-dim` | `text-text-dim` | 最弱文字 |
| `borderDefault` | `--color-border` | `border-border-default` | 默认边框 |
| `borderSubtle` | `--color-border-subtle` | `border-border-subtle` | 淡边框 |
| `glowPrimary` | `--glow-primary` | （CSS 引用） | 主发光 |
| `glowSubtle` | `--glow-subtle` | （CSS 引用） | 微发光 |
| `warning` | `--color-warning` | `text-warning` | 警告状态（新增） |

**Tailwind 类名映射注意**：`bg-surface-deep` 而非 `bg-deep`，避免和 Tailwind 内置类名冲突。文字色用 `text-text-primary` 避免和 Tailwind 的 `text-*` 尺寸类冲突。

### 3.2 间距层（4 个 token）

| JSON key | CSS 变量 | Tailwind 类名 | 默认值 |
|----------|----------|---------------|--------|
| `spacingTight` | `--spacing-tight` | `p-tight`, `m-tight`, `gap-tight` | `4px` |
| `spacingNormal` | `--spacing-normal` | `p-normal`, `m-normal`, `gap-normal` | `8px` |
| `spacingRelaxed` | `--spacing-relaxed` | `p-relaxed`, `m-relaxed`, `gap-relaxed` | `16px` |
| `spacingSpacious` | `--spacing-spacious` | `p-spacious`, `m-spacious`, `gap-spacious` | `24px` |

### 3.3 效果层（10 个 token）

| JSON key | CSS 变量 | Tailwind 类名 | 默认值 |
|----------|----------|---------------|--------|
| `shadowSubtle` | `--shadow-subtle` | `shadow-subtle` | `0 2px 8px rgba(0,0,0,0.15)` |
| `shadowCard` | `--shadow-card` | `shadow-card` | `0 4px 24px rgba(0,0,0,0.3)` |
| `shadowModal` | `--shadow-modal` | `shadow-modal` | `0 16px 48px rgba(0,0,0,0.5)` |
| `shadowDeep` | `--shadow-deep` | `shadow-deep` | `0 24px 64px rgba(0,0,0,0.6)` |
| `radiusSm` | `--radius-sm` | `rounded-sm`（覆盖内置） | `4px` |
| `radiusMd` | `--radius-md` | `rounded-md`（覆盖内置） | `8px` |
| `radiusLg` | `--radius-lg` | `rounded-lg`（覆盖内置） | `12px` |
| `radiusFull` | `--radius-full` | `rounded-full`（覆盖内置） | `9999px` |
| `blurSubtle` | `--blur-subtle` | `blur-subtle` | `4px` |
| `blurOverlay` | `--blur-overlay` | `blur-overlay` | `8px` |

### 3.4 动画层（7 个 token）

| JSON key | CSS 变量 | Tailwind 类名 | 默认值 |
|----------|----------|---------------|--------|
| `durationInstant` | `--duration-instant` | `duration-instant` | `75ms` |
| `durationFast` | `--duration-fast` | `duration-fast` | `150ms` |
| `durationNormal` | `--duration-normal` | `duration-normal` | `250ms` |
| `durationSlow` | `--duration-slow` | `duration-slow` | `400ms` |
| `easeDefault` | `--ease-default` | `ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `easeSpring` | `--ease-spring` | `ease-spring` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `easeDecelerate` | `--ease-decelerate` | `ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` |

### 3.5 排版层（6 个 token）

| JSON key | CSS 变量 | 用法 | 默认值 |
|----------|----------|------|--------|
| `textXs` | `--text-xs` | font-size + line-height | `11px / 1.4` |
| `textSm` | `--text-sm` | | `13px / 1.5` |
| `textBase` | `--text-base` | | `15px / 1.7` |
| `textLg` | `--text-lg` | | `17px / 1.9` |
| `textXl` | `--text-xl` | | `20px / 1.5` |
| `text2xl` | `--text-2xl` | | `24px / 1.4` |

排版 token 不注册为 Tailwind 类名（避免和内置 `text-xs` 冲突），通过 CSS 变量引用：
```css
.text-body { font-size: var(--text-base); line-height: calc(var(--text-base) * 1.7 / 15); }
```

---

## 4. 命名规范

**全链路一致性原则**：JSON key → CSS 变量 → @theme 注册名保持语义一致。

### 转换规则（`toCssVarName`）

```
JSON key (camelCase) → CSS variable (kebab-case with prefix)

primary          → --color-primary
surfaceDeep      → --color-surface-deep
spacingTight     → --spacing-tight
shadowCard       → --shadow-card
durationFast     → --duration-fast
easeDefault      → --ease-default
radiusMd         → --radius-md
textXs           → --text-xs
```

规则：
1. camelCase → kebab-case：`surfaceDeep` → `surface-deep`
2. 加类型前缀：颜色加 `--color-`，间距加 `--spacing-`，阴影加 `--shadow-`，时长加 `--duration-`，缓动加 `--ease-`，圆角加 `--radius-`，排版加 `--text-`
3. 特殊处理：`borderDefault` → `--color-border`（保持向后兼容），`borderSubtle` → `--color-border-subtle`

---

## 5. @theme 注册

在 `index.css` 的 `@theme` 块中注册所有 token：

```css
@theme {
  /* 颜色层 */
  --color-primary: var(--color-primary);
  --color-primary-dim: var(--color-primary-dim);
  --color-primary-deep: var(--color-primary-deep);
  --color-primary-subtle: var(--color-primary-subtle);
  --color-primary-foreground: var(--color-primary-foreground);
  --color-success: var(--color-success);
  --color-error: var(--color-error);
  --color-surface-deep: var(--color-surface-deep);
  --color-surface-base: var(--color-surface-base);
  --color-surface: var(--color-surface);
  --color-surface-elevated: var(--color-surface-elevated);
  --color-surface-rail: var(--color-surface-rail);
  --color-surface-panel: var(--color-surface-panel);
  --color-surface-canvas: var(--color-surface-canvas);
  --color-text-primary: var(--color-text-primary);
  --color-text-secondary: var(--color-text-secondary);
  --color-text-muted: var(--color-text-muted);
  --color-text-dim: var(--color-text-dim);
  --color-border: var(--color-border);
  --color-border-subtle: var(--color-border-subtle);
  --color-warning: var(--color-warning);

  /* 间距层 */
  --spacing-tight: var(--spacing-tight);
  --spacing-normal: var(--spacing-normal);
  --spacing-relaxed: var(--spacing-relaxed);
  --spacing-spacious: var(--spacing-spacious);

  /* 效果层 */
  --shadow-subtle: var(--shadow-subtle);
  --shadow-card: var(--shadow-card);
  --shadow-modal: var(--shadow-modal);
  --shadow-deep: var(--shadow-deep);

  /* 动画层 */
  --duration-instant: var(--duration-instant);
  --duration-fast: var(--duration-fast);
  --duration-normal: var(--duration-normal);
  --duration-slow: var(--duration-slow);
  --ease-default: var(--ease-default);
  --ease-spring: var(--ease-spring);
  --ease-decelerate: var(--ease-decelerate);
}
```

注册后组件可用的类名示例：
- `bg-primary/10` — accent 色 10% 透明度背景
- `bg-surface-deep` — 最深背景色
- `text-text-primary` — 主文字色
- `border-border-default` — 默认边框色
- `p-tight` — 紧凑间距
- `gap-normal` — 标准间距
- `shadow-card` — 卡片阴影
- `rounded-md` — 中圆角（覆盖内置）
- `duration-fast` — 快速动画时长
- `ease-spring` — 弹性缓动

---

## 6. Shadcn 兼容性

### 铁律：禁止 HSL 裸值格式

当前项目已使用 hex/rgba 格式定义 Shadcn 变量（`--primary: #CC7C5E`），不使用 `hsl(var(--xxx))` 模式。此格式必须保持。

新增或修改 Shadcn 变量时：
```css
/* 正确 */
--primary: var(--color-primary);       /* 引用 token */
--background: var(--color-surface-deep);
--ring: var(--color-primary);

/* 禁止 */
--primary: 222 47% 11%;               /* HSL 裸值 */
background: hsl(var(--primary));       /* HSL 包装 */
```

### 映射表

| Shadcn 变量 | 映射到 Token |
|-------------|-------------|
| `--primary` | `var(--color-primary)` |
| `--primary-foreground` | `var(--color-primary-foreground)` |
| `--background` | `var(--color-surface-deep)` |
| `--foreground` | `var(--color-text-primary)` |
| `--card` | `var(--color-surface-base)` |
| `--border` | `var(--color-border)` |
| `--input` | `var(--color-border)` |
| `--ring` | `var(--color-primary)` |
| `--destructive` | `var(--color-error)` |
| `--muted` | `var(--color-surface)` |
| `--muted-foreground` | `var(--color-text-secondary)` |

---

## 7. AI 主题工具（后端）

### 4 个工具

#### 7.1 `theme_list`

列出所有可用主题。

```python
# 返回
{
    "themes": [
        {"id": "lumen-dark", "name": "Lumen 暗色", "is_builtin": True},
        {"id": "lumen-light", "name": "Lumen 浅色", "is_builtin": True},
        {"id": "cyberpunk", "name": "赛博朋克", "is_builtin": False},
    ],
    "current": "lumen-dark"
}
```

#### 7.2 `theme_get`

获取指定主题（或当前主题）的全部 token 值。

参数：`theme_id?: str`（可选，默认当前主题）

返回完整的 token 键值对 + token 类型说明，供 AI 理解每个 token 的语义。

#### 7.3 `theme_apply`

应用主题。支持三种模式：

**模式 1 — 切换已有主题：**
```python
theme_apply(theme_id="cyberpunk")
# → 加载该主题全部 token，推送到前端
# → 清空当前主题的 overrides
# → 更新 app_settings 中的 current_theme_id
```

**模式 2 — 微调个别 token：**
```python
theme_apply(tokens={"primary": "#00ffcc", "spacingTight": "2px"})
# → 校验每个 token
# → 存入 theme_overrides 表
# → SSE 推送变更的 token 到前端
# → 保留 base theme 不变
```

**模式 3 — 生成全新主题：**
```python
theme_apply(tokens={...完整的 52 个 token...})
# → 校验全部 token
# → 不修改任何已有主题
# → 创建临时运行时主题，推送到前端
# → 需要显式 theme_save 才持久化
```

**错误反馈格式（关键）：**
```python
# 校验失败时，必须向 AI 返回明确的错误信息
{
    "status": "error",
    "errors": [
        {
            "token": "durationFast",
            "value": "very-fast",
            "message": "'very-fast' is not a valid CSS time unit. Expected format like '100ms' or '0.5s'."
        }
    ],
    "applied": {"primary": "#00ffcc"},  # 部分成功的 token
    "failed": {"durationFast": "very-fast"}  # 失败的 token
}
```

绝不默默吞掉错误。AI 必须知道哪些 token 被拒绝了。

#### 7.4 `theme_save`

保存当前状态为新主题。

```python
theme_save(name="我的赛博风", description="基于暗色主题的赛博朋克变体")
```

**合并逻辑：**
```
当前 base theme tokens（来自 themes 表）
  + theme_overrides 表中的增量数据
  = 完整的新主题 JSON
```

**保存后清理：**
- 新主题写入 `themes` 表
- 清空 `theme_overrides` 中当前主题的记录
- 更新 `app_settings` 的 `current_theme_id` 为新主题

### 7.5 Token 校验规则

```python
VALID_TOKENS = {
    # 颜色
    "primary": ("color", "主交互色，用于按钮、选中、高亮"),
    "primaryDim": ("color", "深一级 accent"),
    "primaryDeep": ("color", "最深 accent"),
    "primarySubtle": ("color", "极淡 accent 背景，需要半透明"),
    "primaryForeground": ("color", "accent 色上的文字色"),
    "success": ("color", "成功状态色"),
    "error": ("color", "错误状态色"),
    "surfaceDeep": ("color", "最深背景色，导航栏/ActivityBar"),
    "surfaceBase": ("color", "标准背景色，卡片/面板"),
    "surface": ("color", "表面层背景色"),
    "surfaceElevated": ("color", "提升层，输入框/弹窗"),
    "surfaceRail": ("color", "ActivityBar 专用背景"),
    "surfacePanel": ("color", "侧栏面板背景"),
    "surfaceCanvas": ("color", "内容区域背景"),
    "textPrimary": ("color", "主文字色"),
    "textSecondary": ("color", "次要文字色"),
    "textMuted": ("color", "弱化文字色"),
    "textDim": ("color", "最弱文字色，占位符/提示"),
    "borderDefault": ("color", "默认边框色"),
    "borderSubtle": ("color", "淡边框色"),
    "glowPrimary": ("color", "主发光效果色"),
    "glowSubtle": ("color", "微发光效果色"),
    "warning": ("color", "警告状态色"),

    # 间距
    "spacingTight": ("length", "紧凑间距 4px，图标间距/紧凑列表"),
    "spacingNormal": ("length", "标准间距 8px，常规内间距"),
    "spacingRelaxed": ("length", "舒适间距 16px，卡片内边距"),
    "spacingSpacious": ("length", "大间距 24px，区域间距/大留白"),

    # 阴影
    "shadowSubtle": ("shadow", "微弱阴影，用于列表项"),
    "shadowCard": ("shadow", "标准卡片阴影"),
    "shadowModal": ("shadow", "弹窗阴影"),
    "shadowDeep": ("shadow", "深层阴影，浮层/overlay"),

    # 圆角
    "radiusSm": ("length", "小圆角 4px"),
    "radiusMd": ("length", "中圆角 8px"),
    "radiusLg": ("length", "大圆角 12px"),
    "radiusFull": ("length", "圆形 9999px"),

    # 模糊
    "blurSubtle": ("length", "微模糊 4px"),
    "blurOverlay": ("length", "遮罩模糊 8px"),

    # 动画时长
    "durationInstant": ("time", "瞬时 75ms，微交互颜色变化"),
    "durationFast": ("time", "快速 150ms，hover 过渡"),
    "durationNormal": ("time", "标准 250ms，面板展开"),
    "durationSlow": ("time", "慢速 400ms，弹窗入场"),

    # 缓动
    "easeDefault": ("easing", "标准缓动 cubic-bezier(0.4, 0, 0.2, 1)"),
    "easeSpring": ("easing", "弹性缓动 cubic-bezier(0.16, 1, 0.3, 1)"),
    "easeDecelerate": ("easing", "减速缓动 cubic-bezier(0, 0, 0.2, 1)"),

    # 排版
    "textXs": ("fontSize", "极小文字 11px，标签/微文字"),
    "textSm": ("fontSize", "小文字 13px，次要文字/描述"),
    "textBase": ("fontSize", "正文 15px"),
    "textLg": ("fontSize", "大正文 17px，编辑器正文"),
    "textXl": ("fontSize", "小标题 20px"),
    "text2xl": ("fontSize", "标题 24px"),
}
```

校验函数按类型检查 CSS 值合法性：
- `color`: 匹配 hex、rgb/rgba、hsl/hsla、命名色
- `length`: 匹配 `^\d+(\.\d+)?(px|rem|em|vh|vw|%)$`
- `shadow`: 允许包含 `none` 或 `inset` + 颜色 + 长度的组合
- `time`: 匹配 `^\d+(\.\d+)?(ms|s)$`
- `easing`: 匹配 `linear` 或 `cubic-bezier(...)`
- `fontSize`: 匹配 `^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$`（支持 `15px / 1.7` 格式）

---

## 8. 数据库持久化

### 8.1 表结构

```sql
-- 主题库
CREATE TABLE themes (
    id TEXT PRIMARY KEY,           -- "lumen-dark", "cyberpunk-2026"
    name TEXT NOT NULL,            -- 显示名
    description TEXT,              -- 主题描述
    tokens TEXT NOT NULL,          -- JSON: {"primary": "#CC7C5E", ...}
    is_builtin BOOLEAN DEFAULT 0,  -- 内置主题不可删除
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 运行时覆盖层（非破坏性编辑）
CREATE TABLE theme_overrides (
    theme_id TEXT NOT NULL,        -- 关联哪个基础主题
    token_name TEXT NOT NULL,      -- token 名
    token_value TEXT NOT NULL,     -- 覆盖值
    PRIMARY KEY (theme_id, token_name),
    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
);

-- 应用设置
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- 初始数据: INSERT INTO app_settings VALUES ('current_theme_id', 'lumen-dark');
```

### 8.2 生命周期

```
首次启动：
  内置主题 JSON 文件 → 导入 themes 表（is_builtin=1）
  → app_settings: current_theme_id = 'lumen-dark'

正常运行：
  读取 current_theme_id → 加载 themes.tokens → 渲染 CSS
  + theme_overrides 增量 → 合并应用

AI 微调：
  theme_apply(tokens={...}) → 存入 theme_overrides → SSE 推送

AI 保存：
  theme_save(name) → base tokens + overrides 合并 → 写入 themes 表 → 清空 overrides

切换主题：
  theme_apply(theme_id="lumen-light") → 清空当前主题 overrides → 更新 current_theme_id → 加载新主题
```

### 8.3 切换主题时的 overrides 处理

**切换时清空当前主题的 overrides，不缓存。** overrides 是"试错层"，切走代表不满意。想要保留应先 `theme_save`。

---

## 9. 前端实时更新

### 9.1 SSE 监听

```typescript
// useThemeStore.ts (Zustand)
interface ThemeState {
  currentThemeId: string;
  aiOverrides: Record<string, string>;  // AI 运行时覆盖
  applyThemeUpdate: (tokens: Record<string, string>) => void;
  resetOverrides: () => void;
}
```

### 9.2 样式注入（非 inline style）

```typescript
function injectThemeStyle(overrides: Record<string, string>) {
  let style = document.getElementById("ai-dynamic-theme") as HTMLStyleElement;
  if (!style) {
    style = document.createElement("style");
    style.id = "ai-dynamic-theme";
    document.head.appendChild(style);
  }

  const css = Object.entries(overrides)
    .map(([key, value]) => `:root { --${toCssVarName(key)}: ${value}; }`)
    .join("\n");

  style.textContent = css;
}
```

### 9.3 FOUC 防护

```typescript
// 在 React 挂载前执行（index.tsx 或 main.tsx 顶部）
function initThemeSync() {
  try {
    const cached = localStorage.getItem("lumen-theme-cache");
    if (cached) {
      const overrides = JSON.parse(cached);
      injectThemeStyle(overrides);
    }
  } catch { /* ignore parse errors */ }
}

initThemeSync(); // 同步执行，阻塞渲染

// React 挂载后，异步同步后端 DB
async function syncThemeFromBackend() {
  const data = await fetch("/api/theme/current").then(r => r.json());
  const merged = { ...data.tokens, ...data.overrides };
  localStorage.setItem("lumen-theme-cache", JSON.stringify(merged));
  injectThemeStyle(merged);
}
```

### 9.4 重置功能

前端 TitleBar 保留"恢复默认主题"按钮：
- 清空 `aiOverrides`
- 移除 `<style id="ai-dynamic-theme">` 标签
- 调用 `DELETE /api/theme/overrides`
- 恢复当前 base theme 的原始 CSS 变量

---

## 10. 组件迁移

### 10.1 类名映射表

从当前长写法迁移到 @theme 注册的短类名：

| 当前写法 | 迁移后 | 说明 |
|---------|--------|------|
| `bg-[var(--color-primary)]` | `bg-primary` | accent 背景 |
| `bg-[var(--color-primary)]/10` | `bg-primary/10` | 带透明度 |
| `text-[var(--color-text-primary)]` | `text-text-primary` | 主文字 |
| `text-[var(--color-text-dim)]` | `text-text-dim` | 最弱文字 |
| `border-[var(--color-border)]` | `border-border-default` | 默认边框 |
| `bg-[var(--color-bg-deep)]` | `bg-surface-deep` | 最深背景 |
| `bg-[var(--color-bg-elevated)]` | `bg-surface-elevated` | 提升层背景 |
| `bg-[var(--color-bg-panel)]` | `bg-surface-panel` | 面板背景 |

注意：颜色类名有 `color-` 前缀在 `@theme` 中（如 `--color-surface-deep`），Tailwind 生成的类名会省略 `color-`，变成 `bg-surface-deep`。文字色比较特殊，`@theme` 注册的是 `--color-text-primary`，生成的类名是 `text-text-primary`。

### 10.2 迁移范围

一次性迁移所有组件文件中的 `bg-[var(--color-xxx)]`、`text-[var(--color-xxx)]`、`border-[var(--color-xxx)]` 长写法。约 900+ 处替换。

### 10.3 不迁移的部分

以下保持现有写法：
- `bg-[var(--glow-primary)]` — 发光色不是 Tailwind 颜色类
- `border-[var(--glow-primary)]` — 同上
- `bg-[var(--color-primary-subtle)]` → `bg-primary-subtle` — 可以迁移
- Shadcn 组件内部样式（由 Shadcn 自己管理）

---

## 11. 文件清单

### 前端修改

| 文件 | 操作 |
|------|------|
| `src/lib/theme/types.ts` | 修改：扩展 ThemeTokens 类型，加入 5 层全部 token |
| `src/lib/theme/themes/lumen-dark.json` | 修改：加入所有新 token（间距/效果/动画/排版） |
| `src/lib/theme/themes/lumen-light.json` | 修改：同上 |
| `src/lib/theme/render-css.ts` | 修改：渲染所有新 token 为 CSS 变量 |
| `src/styles/index.css` | 修改：`@theme` 注册全部 token |
| `src/stores/useThemeStore.ts` | 新建：Zustand store，SSE 监听 + 覆盖管理 |
| `src/lib/theme/token-registry.ts` | 新建：token 名/类型/描述的 TypeScript 定义 |
| `src/lib/theme/utils.ts` | 新建：`toCssVarName()` 转换函数 |
| 所有组件 `.tsx` 文件（~50 个） | 修改：长写法 → 短写法迁移 |

### 后端新增

| 文件 | 操作 |
|------|------|
| `lumen/tools/theme_tool.py` | 新建：4 个 AI 工具 |
| `lumen/services/theme.py` | 新建：主题 CRUD + 校验逻辑 |
| `api/routes/theme.py` | 新建：REST API 端点 |
| `api/main.py` | 修改：注册 theme 路由 |
| `lumen/types/theme.py` | 新建：主题相关类型定义 |

---

## 12. 不在本次范围

- 动态效果预设系统（发光流转、失真抖动等）→ 独立 spec
- 自定义 CSS 注入（用户写原生 CSS）→ 独立 spec
- 主题编辑器 UI（可视化拖拽调色板）→ 独立 spec
- 多用户主题隔离（桌面应用单用户，不需要）
