# prompt/ — 提示词组装层

> 架构角色：**嘴巴** — 负责提示词拼接、角色管理、上下文注入

## 世界书系统（WorldBook）

关键词触发 → 自动注入相关设定的动态上下文系统。参考 SillyTavern World Info。

### 核心流程

```
用户发消息 → worldbook_matcher 扫描消息 → 匹配关键词 → 按优先级排序 → 注入到提示词
```

### 匹配逻辑

1. **主关键词**（OR）：任一命中即触发
2. **次关键词**（可选，需启用 selective）：
   - `AND`：次关键词也必须命中才触发（交集过滤）
   - `NOT`：次关键词命中时不触发（排除过滤）
3. **匹配选项**：区分大小写、全词匹配（正则 `\b`）
4. **角色过滤**：`character_ids` 非空时只对指定角色生效

### 注入控制

| 字段 | 说明 |
|------|------|
| `position` | 注入位置：before_sys / after_sys / before_user / after_user |
| `depth` | 注入深度（1-10），同位置内的排序依据 |
| `order` | 优先级，数字越小越优先 |
| `scan_depth` | 只扫描最近 N 条消息 |

### 文件说明

| 文件 | 职责 |
|------|------|
| `worldbook_matcher.py` | 匹配引擎 — 扫描消息、关键词匹配、排序 |
| `worldbook_store.py` | 存储层 — JSON 文件 CRUD |
| `character.py` | 角色管理 — 角色卡加载、角色目录 |

### 前端对应

| 文件 | 说明 |
|------|------|
| `src/types/worldbook.ts` | TypeScript 类型定义 |
| `src/pages/WorldBookEditor.tsx` | 编辑器（双栏布局：触发条件 + 注入控制） |
| `src/pages/WorldBookList.tsx` | 列表管理页 |
| `src/api/worldbook.ts` | API 请求层 |
