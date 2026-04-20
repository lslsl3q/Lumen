# Lumen Skill 开发指南

## 目录结构

```
skill-name/
├── SKILL.md              # 主文件（必需）— 提示词 + 元数据
├── references/           # 参考资料（可选）
│   ├── research.md
│   └── examples.json
└── scripts/              # 可执行脚本（可选）
    └── fetch_data.py
```

## SKILL.md 格式

```markdown
---
name: 写作助手
description: 帮助用户进行创意写作
enabled: true
when_to_use: 当用户需要写作帮助时
allowed_tools: [web_search, web_fetch]
argument_hint: "[写作主题]"
priority: 10
script: scripts/fetch_data.py
---

## Goal
目标描述

## 原则
1. 第一条原则
2. 第二条原则
```

### Frontmatter 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 显示名 |
| `description` | 否 | 一句话说明 |
| `enabled` | 否 | `true`=预注入到提示词，`false`=休眠（可通过命令调用）|
| `when_to_use` | 否 | 使用时机描述（帮助 AI 自主判断是否使用）|
| `allowed_tools` | 否 | 依赖的 Lumen 工具列表 |
| `argument_hint` | 否 | 参数提示（显示在斜杠命令旁）|
| `priority` | 否 | 注入优先级（数字越大越先注入，默认 0）|
| `script` | 否 | 可执行脚本路径（相对于 skill 目录）|

## 两种使用工具的方式

### 方式 A：提示词引导（无需脚本）

在 SKILL.md 正文中直接告诉 AI 用什么工具：

```markdown
当用户让你做研究时：
1. 先用 web_search 搜索相关信息
2. 用 web_fetch 抓取关键网页内容
3. 整合信息后给出分析
```

AI 会在 ReAct 循环中自动调用这些工具。简单场景推荐这种方式。

### 方式 B：脚本调用（复杂场景）

脚本可以调用 Lumen 内置工具获取数据：

```python
# scripts/fetch_data.py
import sys, os
sys.path.insert(0, os.environ["LUMEN_ROOT"])
from lumen.tools.lumen_skill_api import search, fetch

query = os.environ.get("LUMEN_SKILL_ARGS", "")
if query:
    results = search(query)
    for r in results[:3]:
        print(f"## {r['title']}")
        print(f"URL: {r['url']}")
        print(r['snippet'])
        print()
```

可用的工具 API：
- `search(query, max_results=5)` — DuckDuckGo 搜索
- `fetch(url)` — 抓取网页内容
- `read_file(path)` — 读取文件
- `list_files(path, pattern)` — 列出目录文件
- `calculate(expression)` — 数学计算

## 脚本安全规则

- 脚本在子进程中执行，30 秒超时
- 输出截断为 2000 字符
- 脚本路径必须在 skill 目录内（防路径穿越）
- 环境变量：`LUMEN_ROOT`（Lumen 根目录）、`LUMEN_SKILL_DIR`（skill 目录）、`LUMEN_SKILL_ARGS`（用户参数）

## 导入方式

1. **前端上传**：Settings → Skills → 导入 → 选择 .md 或 .zip 文件
2. **手动放置**：把 skill 文件夹放到 `lumen/skills/` 目录下
