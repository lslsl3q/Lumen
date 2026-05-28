---
name: Lumen Dark Instrument
description: V3 暗色金属质感设计系统 — "The Dark Instrument"
version: 3
---

# Design System: Lumen — Dark Instrument

## 1. Overview

**Creative North Star: "The Dark Instrument"**

Lumen 的视觉语言源于高端音响设备——铝合金拉丝面板、暗色金属网罩、微光指示点。不是消费电子那种闪亮，而是录音室里用了十年的设备：表面有细腻的微纹理，暗色涂层吸收了多余光线，只在一两个关键位置漏出温润的指示光。

这种"金属网"质感——不是真正的 mesh element，而是指表面之间的层级过渡像金属网一样有微妙的透气和呼吸。底色深而透，不是实心黑块。

这个系统是 **Committed** 色彩策略：一个特征色覆盖 30-60% 的界面面积（侧边栏、工具栏底、选中面板），赋予工具明确的色彩身份。其余深色中性面承载内容，层次自然。

编辑器用精工衬线字体（像一本认真排版的书），UI 用系统无衬线（干净、快）。动效响应如旋钮的阻尼——有手感，不表演。

**Key Characteristics:**
- 暗色金属底色，有深度而非扁平
- 一个个性色大面积使用（Committed），但不是霓虹
- 精工感细节：微光刻度、细腻分隔、克制的高光
- 编辑区衬线字体 + UI 系统无衬线
- 拒绝 SaaS AI 模板：无渐变卡片、无 hero 布局、无紫蓝霓虹

## 2. Colors

**The Committed Palette.** 青绿色系承担特征色，冷灰中性深色系承载其余部分。

### Primary（特征色）
- **Teal Accent** `#4ed8b8`: 选中态、活跃指示灯、关键操作、进度条。像阳极氧化金属的冷色调。
- **Teal Dim** `#38a890`: hover 态、次要指示。
- **Teal Glow** `rgba(78,216,184,0.25)`: 发光效果，box-shadow 光晕。

### Neutral（中性色）
- **Abyss** `#050908`: 最深底色，编辑器背景。带微量青绿色偏。
- **Deep** `#0e1614`: 次深层，侧边栏/面板底。
- **Surface** `#141d1c`: 内容表面，主工作区。
- **ID** `#0a1d1a`: 工具栏底色。
- **ID Surface** `#0e2622`: 工具栏表面。
- **ID Raised** `#13302b`: 浮起元素。

### Accent Secondary
- **Gold** `#d4a84b`: Beat 标记、Scene 元数据、Plot 节点。辅助特征色，仅在叙事结构元素使用。
- **Gold Glow** `rgba(212,168,75,0.3)`: Gold 发光效果。

### Text Hierarchy
- **Text Primary** `#ded9d3`: 正文文字，暖白。
- **Text Secondary** `#9c9792`: 次要标签。
- **Text Dim** `#605c57`: 辅助信息。
- **Text Muted** `#3a3733`: 最弱层级。

### Named Rules
**The Committed Surface Rule.** 特征色不只做点缀，它占据侧边栏、工具栏底、选中面板等大面积区域。这不是"加个强调色按钮"，而是"整个工具有明确的色彩身份"。中性面退居为内容容器。

**The No-SaaS Rule.** 禁止渐变卡片、禁止 hero metric 大数字布局、禁止紫蓝霓虹、禁止玻璃态。如果看起来像一个 SaaS AI 产品登录页，就错了。

## 3. Typography

**Display Font:** "Noto Serif SC", "Source Serif 4", Georgia, serif（for manuscript/editor）
**Body Font:** -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif

**Character:** 编辑器用精工衬线——像一本印刷精良的书的正文质感。UI 用系统无衬线，干净、快、不抢。两者之间有明确的角色分工。

### Hierarchy
- **Title** (600, 20px, 1.4): 页面标题，系统无衬线。
- **Body** (400, 14px, 1.5): UI 标签和正文，系统无衬线，行宽 65-75ch。
- **Editor** (400, 18-20px, 1.7): 写作区域，精工衬线，fit-content 宽度。
- **Label** (500, 11px, 0.04em, uppercase): 分区标题，系统无衬线。

### Named Rules
**The Two-Font Rule.** 衬线只进编辑器。UI 标签、按钮、导航、数据永远用系统无衬线。两种字体不混用在同一区域。

## 4. Elevation

**Flat at rest, layered through subtle tonal shifts.** 不使用 Soft UI 外凸阴影。深度通过三级明度差表达：底层 → 内容面 → 浮起面，每级 ~8-12% 明度差。无投影或仅在 hover/active 状态出现微量阴影。像暗色金属表面之间的台阶，不是软硅胶。

### Surface Layers
| 层级 | 变量 | 用途 |
|------|------|------|
| L0 Abyss | `--abyss` #050908 | 最底层，编辑器背景 |
| L1 Deep | `--deep` #0e1614 | 侧边栏/面板底 |
| L2 Surface | `--surface` #141d1c | 内容表面 |
| L3 ID | `--id` #0a1d1a | 工具栏底 |
| L4 ID Surface | `--id-surface` #0e2622 | 工具栏表面 |
| L5 ID Raised | `--id-raised` #13302b | 浮起元素 |

### Border Treatment
- 面板边框：`1px solid rgba(255,255,255,0.03)` — 几乎不可见，靠色差区分
- 按钮边框：`1px solid rgba(255,255,255,0.04)` — hover 时亮到 0.05
- 活跃态边框：`1px solid rgba(78,216,184,0.1)` — 特征色微露

## 5. Components

### Navigation Item
- 默认：`color: rgba(222,217,211,0.38)`, 无背景
- Hover：`color: rgba(222,217,211,0.7)`, `background: rgba(255,255,255,0.02)`
- Active：特征色背景渐变 + 1px 特征色边框 + 微光阴影
- 圆角 4px，内间距 9px 10px

### Toolbar Button
- Segmented 控件组：`background: rgba(0,0,0,0.5)`, `border-radius: 5px`
- 按钮：内间距 7px 16px, 圆角 3px
- Active：特征色渐变背景 + 边框 + box-shadow
- 工具栏底边有特征色渐变线（0.2 opacity）

### Right Panel Card
- 默认：半透明渐变背景 `rgba(255,255,255,0.012) → transparent`
- Hover：`background: rgba(255,255,255,0.025)`, 边框亮到 0.05
- Selected：特征色边框 + 背景 + 微光
- 圆角 5px，内间距 12px 14px

### Pilot Light（指示灯）
- 尺寸：5×5px 圆点
- On：特征色 + glow box-shadow
- Warm：Gold + gold glow
- Dim：`rgba(255,255,255,0.08)`
- Active 脉冲：3s ease-in-out infinite

### Editor
- 容器：特征色径向渐变（极低 opacity）+ 线性渐变底
- 呼吸光环：`inset 0 0 40px rgba(78,216,184,0.08)`，4s 呼吸动画
- 编辑器字号：19px / line-height 1.9 / serif 字体栈
- 最大宽度：720px（fit-content 模式可调）

### Tag / Badge
- Teal tag：`color: #4ed8b8`, `background: rgba(78,216,184,0.08)`
- Gold tag：`color: #d4a84b`, `background: rgba(212,168,75,0.08)`
- 字号 10px, 圆角 3px, 内间距 3px 8px

### Progress Bar
- 轨道：`2px rgba(255,255,255,0.02)`
- 填充：特征色线性渐变
- 流光动画：30% 宽白色透明渐变条扫过

## 6. Hover Effects

效果系统独立于主题，通过 CSS 变量引用主题颜色。

### Glitch（故障）— CP2077 风格
- 6 层叠加：红青水平条带 + 蓝/洋红随机方块 + 白黄闪线 + SVG 置换
- 生命周期：~0.5s，不持续
- SVG filter：`feTurbulence` + `feDisplacementMap`，seed 每 80ms 刷新
- 配色：`--glitch-red`, `--glitch-cyan`, `--glitch-blue`, `--glitch-magenta`, `--glitch-yellow`

### Shimmer（流光）— 优雅扫光
- 单层：对角线渐变扫过元素表面
- 配色跟随主题特征色

### 架构
```
src/effects/
  glitch.css         ← keyframes + SVG filter
  shimmer.css        ← keyframes
  useGlitchEffect.ts  ← React Hook
  useShimmerEffect.ts ← React Hook
```
主题 JSON 只存 `"hoverEffect": "glitch"`，效果库独立切换。

## 7. Do's and Don'ts

### Do:
- **Do** 让特征色占据 30-60% 的表面面积——侧边栏、工具栏底、选中面板。
- **Do** 用明度差异表达层级，而非阴影。
- **Do** 编辑器用衬线，UI 用系统无衬线。
- **Do** 动效用 150-250ms ease-out，像精密转盘的阻尼。
- **Do** 保持面板间的微妙色差（2-4% 明度差）。

### Don't:
- **Don't** 使用渐变卡片、hero metric 大数字、玻璃态——SaaS AI 模板三大件。
- **Don't** 使用 border-left > 1px 作为彩色装饰条。
- **Don't** 使用渐变文字。
- **Don't** 在 UI 标签中使用衬线字体。
- **Don't** 使用 Soft UI 硅胶阴影或纯扁平 Material。
- **Don't** 所有表面用同一个颜色——需要三级明度差。
- **Don't** 跟 NC 的冷灰 zinc 色板——Lumen 走冷青绿金属，身份不同。
