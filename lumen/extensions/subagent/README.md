# Subagent Extension

Lumen 的子代理系统。让 AI 在 ReAct 循环中调用独立子代理完成子任务，自带上下文隔离和深度防护。

## 核心概念

**子代理 = 独立上下文的一次性任务执行器。** 接收任务，执行完毕返回结果，不保留状态，不与其他子代理通信。

```
主 Agent ──调用──→ subagent_call 工具 ──派发──→ 子代理（空上下文）
                                                    │
                                                    ↓ 执行 + 工具调用循环
                                                    │
                                                  返回结果
```

## 四种执行模式

| 模式 | 参数 | 说明 |
|------|------|------|
| **Single** | `{ agent, task }` | 单个子代理执行 |
| **Chain** | `{ chain: [{agent, task}, ...] }` | 串行管道，上一步输出成为下一步的 `{previous}` |
| **Parallel** | `{ tasks: [{agent, task}, ...] }` | 并发执行（最多 4 个任务） |
| **Fanout** | `{ fanout: "任务描述" }` | AI 自动分析拆分任务，再并发执行 |

还有 **异步模式**（`async: true`）和 **管理模式**（`action: status/list/resume/skills`）。

## 内置 Agent

Agent 定义在 `agents/` 目录，Markdown + YAML frontmatter 格式：

| Agent | 用途 | 工具 |
|-------|------|------|
| `scout` | 快速侦察代码库，返回压缩摘要 | web_search |
| `reviewer` | 代码审查（正确性/安全/性能/可维护） | file_manager |
| `worker` | 通用任务：编码、修改、创建 | file_manager |

## 自定义 Agent

在以下位置放置 `.md` 文件即可（优先级从低到高）：

1. **内置**: `lumen/extensions/subagent/agents/` — 随 Lumen 发布
2. **用户级**: `~/.lumen/agents/` — 全局可用
3. **项目级**: `.lumen/agents/` — 项目特定

### Agent 文件格式

```markdown
---
name: my_agent
description: 我的自定义 Agent
model:                    # 空=用全局默认模型
tools: file_manager, web  # 工具白名单（逗号分隔）
max_iterations: 8         # 工具调用最大轮次（默认 8，上限 50）
max_depth: 1              # 嵌套深度（保留字段）
thinking: high            # high/medium/low/空(不启用)
systemPromptMode: replace # replace(覆盖) / append(追加到默认)
defaultReads: src/main.py, README.md  # 启动时自动读取的文件
---

你的系统提示词写在这里...
```

### 字段说明

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `name` | string | 文件名 | Agent 名称（用于调用） |
| `description` | string | 空 | 简短描述（给 AI 选择用） |
| `model` | string | 空 | 指定模型，空则用全局默认 |
| `tools` | string/list | 空 | 工具白名单，空=仅纯 LLM |
| `max_iterations` | int | 8 | 工具调用循环上限 |
| `thinking` | string | 空 | high=16000/medium=8000/low=2000 budget |
| `systemPromptMode` | string | replace | append=追加到默认 prompt 后 |
| `defaultReads` | string/list | 空 | 启动时自动读取文件注入上下文 |

## Skills 技能系统

技能是可复用的提示词模板，注入到子代理的系统消息中。

内置技能在 `skills/` 目录：

| Skill | 用途 |
|-------|------|
| `code_review` | 结构化代码审查（四级严重度） |
| `research` | 信息检索与研究 |
| `summarize` | 压缩摘要 |
| `refactor` | 重构指导 |

使用时在调用参数中指定：`{ agent: "worker", task: "...", skills: ["code_review"] }`

自定义技能放在 `~/.lumen/skills/` 目录，格式与内置技能相同（YAML frontmatter + body）。

## 安全机制

### 深度防护
用 `contextvars` 追踪嵌套层级（默认 max=2）。子代理调用子代理会被拦截。

### 全局工具禁止列表
所有子代理都不能调用的工具：`subagent_call`（递归防护）、`chrome_bridge`（浏览器控制）、`theme`（主题修改）。

### Agent 级白名单
每个 Agent 可以指定 `tools` 白名单，只能使用列表中的工具。

## 调用示例

```
# Single 模式
subagent_call({ agent: "scout", task: "找到所有认证相关的代码" })

# Chain 模式 — 侦察 → 实现
subagent_call({
  chain: [
    { agent: "scout", task: "分析 {task} 的代码结构" },
    { agent: "worker", task: "根据 {previous} 实现修改" }
  ],
  task: "给登录接口加速率限制"
})

# Parallel 模式 — 同时侦察多个方向
subagent_call({
  tasks: [
    { agent: "scout", task: "找前端认证代码" },
    { agent: "scout", task: "找后端认证代码" },
    { agent: "scout", task: "找认证相关测试" }
  ]
})

# Fanout 模式 — AI 自动拆分
subagent_call({ fanout: "全面评估这个项目的代码质量" })

# 异步模式
subagent_call({ agent: "worker", task: "重构数据库层", async: true })

# 管理操作
subagent_call({ action: "status", id: "abc12345" })
subagent_call({ action: "list" })
subagent_call({ action: "skills" })
```

## 文件结构

```
subagent/
├── __init__.py        # 注册/注销 + 工具描述动态更新
├── agent_config.py    # Agent 发现与配置（YAML frontmatter 解析）
├── execution.py       # 单次执行器（工具调用循环 + 会话记录）
├── tool_def.py        # 工具定义 + 模式分发 + 深度防护
├── async_runner.py    # 异步执行（后台任务管理）
├── chain.py           # Chain 模式（串行管道）
├── parallel.py        # Parallel 模式（并发执行）
├── fanout.py          # Fanout 模式（AI 拆分 + 并发）
├── session.py         # 会话记录（JSONL 格式）
├── output.py          # 输出管理（截断 + 文件保存）
├── skill_loader.py    # 技能加载器
├── agents/            # 内置 Agent 定义
│   ├── scout.md
│   ├── reviewer.md
│   └── worker.md
└── skills/            # 内置技能模板
    ├── code_review.md
    ├── research.md
    ├── summarize.md
    └── refactor.md
```
