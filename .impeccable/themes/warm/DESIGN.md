---
name: Lumen Warm
description: V2 暖灰赤陶棕设计系统 — 温暖手作质感
version: 2
---

# Design System: Lumen — Warm

## 1. Overview

**Creative North Star: "The Craftsman's Workshop"**

温暖的手作质感——赤陶棕点缀、暖灰底色、Soft UI 软触感。像匠人工作室里的工具：木质桌面、铜质旋钮、羊皮纸笔记。不冰冷，不张扬，有温度。

## 2. Colors

### Primary（特征色）
- **Terracotta** `#CC7C5E`: 强调色，克制使用（10% 面积原则）。温暖、有机、像烧制的陶土。

### Neutral（暖灰）
- **Base** `#141413`: 最深底色，暖灰偏棕。
- **Surface** `#1F1F1E`: 内容表面。
- **Raised** `#333230`: 浮起面，最亮的中性色。
- 所有灰色偏暖（高光侧用 `rgba(60,58,55,...)` 而非纯灰白）。

### Text Hierarchy
- **Primary** `#ded9d3`: 正文，暖白。
- **Secondary**: 次要信息。
- **Dim**: 辅助信息。

## 3. Typography

同 V3：编辑器衬线 + UI 系统无衬线。

- **Editor**: 18-20px, line-height 1.7, serif 字体栈
- **UI**: 系统无衬线，14px base
- **Label**: 11px, 500 weight, uppercase, 0.04em tracking

## 4. Elevation

**Soft UI 阴影系统。** 通过软阴影创造触感：
- **soft-panel**: 外凸阴影 + 1px 微亮边 → 面板
- **soft-item**: 轻柔凸起 → 列表项
- **soft-btn**: 触感凸起 → 按钮
- **soft-pressed**: 按下沉入 → active 态

阴影偏暖调，不用冷灰白。

## 5. Components

[to be resolved during implementation — 参考 V2 .impeccable.md]

## 6. Hover Effects

同 V3 效果库，配色替换为暖色系：
- 故障效果：暖色系 glitch 颜色（如深红/琥珀/铜色）
- 流光效果：赤陶棕色调光带

## 7. Do's and Don'ts

### Do:
- **Do** 克制使用强调色，10% 面积原则。
- **Do** 用 Soft UI 阴影创造触感。
- **Do** 保持暖灰色调的一致性。

### Don't:
- **Don't** 使用冷灰、蓝色系。
- **Don't** 使用渐变卡片、玻璃态。
- **Don't** 过度使用强调色。
