# Lumen 代码结构索引

> **用途**：这是 Lumen 项目的代码地图。新会话开始时先读这个文件，了解项目组织结构，然后按需读取具体代码。
> **架构哲学**：按系统角色（关注点）分层组织，不按业务功能分。详见 [memory/architecture_philosophy.md](memory/architecture_philosophy.md)。

**最后更新**：2026-04-16 (T2.1 Markdown渲染 + T2.2 会话侧边栏/历史持久化)

---

## 目录结构概览

```
Lumen/
├── lumen/                        # 核心代码包（按角色分层）
│   ├── __init__.py               # 对外统一接口（re-export facade）
│   ├── config.py                 # 全局配置（AsyncOpenAI客户端、模型选择）
│   ├── characters/               # 角色数据（JSON）
│   │   ├── default.json          # 默认助手
│   │   └── xiaoming.json         # 小明角色
│   ├── data/                     # 运行时数据
│   │   └── history.db            # SQLite数据库
│   │
│   ├── core/                     # 核心引擎 — "大脑"
│   │   ├── types.py              # core 专用类型（预留）
│   │   ├── chat.py               # ReAct 循环（异步生成器，SSE流式输出）
│   │   └── session.py            # 会话生命周期（switch_character为异步）
│   │
│   ├── tools/                    # 工具系统 — "双手"
│   │   ├── types.py              # ErrorCode、ToolDefinition
│   │   ├── base.py               # 执行引擎（Pydantic 校验）、结果格式化、提示词生成
│   │   ├── parse.py              # AI输出 → 工具调用 解析（Pydantic 校验）
│   │   ├── registry.py           # 工具注册中心（CRUD、验证）
│   │   ├── registry.json         # 工具定义数据
│   │   ├── calculate.py          # 工具：计算器
│   │   ├── web_search.py         # 工具：网页搜索（调用 services/search.py）
│   │   └── web_fetch.py          # 工具：网页抓取（调用 services/fetch.py）
│   │
│   ├── services/                 # 基础设施 — "神经"
│   │   ├── types.py              # SearchResult、SessionInfo
│   │   ├── context/              # 上下文管理（折叠、裁剪、过滤）
│   │   │   ├── __init__.py       # 对外接口（re-export）
│   │   │   └── manager.py        # 折叠 + 过滤 + 裁剪
│   │   ├── llm.py                # LLM适配器（异步，OpenAI兼容格式）
│   │   ├── search.py             # 搜索服务（DuckDuckGo后端，可切换）
│   │   ├── fetch.py              # 网页抓取服务（httpx异步获取+文本提取）
│   │   ├── history.py            # SQLite持久化（会话、消息、摘要）
│   │   ├── memory.py             # 记忆系统（异步摘要生成、记忆注入）
│   │   ├── vector_store.py       # 【预留】向量存储
│   │   ├── knowledge.py          # 【预留】知识图谱
│   │   └── emotion.py            # 【预留】情感引擎
│   │
│   ├── prompt/                   # 提示词构建 — "嘴巴"
│   │   ├── types.py              # CharacterCard（Pydantic）、DynamicContext（TypedDict）
│   │   ├── builder.py            # 系统提示词拼接（角色+工具+动态注入）
│   │   └── character.py          # 角色卡片加载（CharacterCard Pydantic 校验）
│   │
│   └── types/                    # 类型定义 — "词汇"
│       ├── __init__.py           # 统一 re-export
│       ├── messages.py           # 消息类型（TypedDict）+ 工厂函数
│       ├── events.py             # SSE 事件类型（TypedDict）
│       └── tools.py              # 工具协议类型（Pydantic）
│
├── api/                          # FastAPI HTTP接口
│   ├── main.py                   # 应用入口、CORS、路由注册
│   └── routes/
│       ├── chat.py               # 聊天端点（async for直连，无线程池翻译）
│       ├── session.py            # 会话端点（new/load/list/delete/reset）
│       └── character.py          # 角色端点（list/get/switch）
│
├── lumen-Front/                  # 前端（Tauri 2 桌面应用）
│   ├── src/
│   │   ├── App.tsx               # 应用入口
│   │   ├── api/
│   │   │   ├── chat.ts           # HTTP客户端（SSE流式 + 历史加载）
│   │   │   └── session.ts        # 会话API客户端（CRUD + 重置）
│   │   ├── hooks/
│   │   │   ├── useChat.ts        # 聊天状态Hook（流式 + 会话管理 + 历史加载）
│   │   │   └── useSessions.ts    # 会话列表Hook（CRUD + 日期格式化）
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx # 布局容器（协调 Sidebar + Panel）
│   │   │   ├── ChatSidebar.tsx   # 会话侧边栏（列表 + 新建/删除/切换）
│   │   │   ├── ChatPanel.tsx     # 聊天面板（消息列表 + 工具状态 + 输入框）
│   │   │   └── MarkdownContent.tsx # Markdown渲染（语法高亮 + 流式光标）
│   │   ├── types/
│   │   │   └── session.ts        # 会话/历史消息类型
│   │   └── styles/
│   │       ├── App.css           # 主样式（Lumen暗色主题）
│   │       └── markdown.css      # Markdown暗色主题样式
│   └── src-tauri/                # Rust后端（Tauri壳）
│
├── tests/                        # 测试
├── requirements.txt              # Python依赖
├── .env                          # 环境配置（API_URL, API_KEY, MODEL）
├── CODE_INDEX.md                 # 本文件
└── CLAUDE.md                     # Claude Code工作指南
```

---

## 核心模块调用关系

```
api/routes/chat.py ──→ lumen/core/chat.py（聊天主循环）
                          ├── lumen/core/session.py（会话状态）
                          ├── lumen/services/context/（上下文折叠+裁剪）
                          ├── lumen/services/llm.py（LLM调用）
                          ├── lumen/services/history.py（持久化）
                          ├── lumen/services/memory.py（记忆注入）
                          ├── lumen/tools/base.py（工具执行）
                          ├── lumen/tools/parse.py（工具解析）
                          ├── lumen/tools/registry.py（工具验证）
                          ├── lumen/prompt/builder.py（提示词拼接）
                          └── lumen/config.py（模型配置）
```

---

## 各层职责速查

### core/ — 核心引擎

| 文件 | 职责 | 关键函数 |
|------|------|----------|
| `chat.py` | ReAct 循环（异步生成器，推理→行动→观察→...→回答），工具调用流程 | `async chat_stream()`, `async chat_non_stream()`, `validate_tool_call()` |
| `session.py` | 会话生命周期（内存+DB双查，switch_character异步） | `ChatSession`, `SessionManager`, `get_session_manager()` |

### tools/ — 工具系统

| 文件 | 职责 | 关键函数 |
|------|------|----------|
| `base.py` | 执行引擎、结果格式化 | `execute_tool()`, `execute_tools_parallel()`, `get_tool_prompt()` |
| `parse.py` | AI输出解析 | `parse_tool_call()` |
| `registry.py` | 工具注册表 | `get_registry()`, `ToolRegistry` |
| `calculate.py` | 数学计算 | `execute()` |
| `web_search.py` | 网页搜索 | `execute()` |
| `web_fetch.py` | 网页抓取 | `execute()` |

**添加新工具**：在 `tools/` 下新建 `.py` 文件，实现 `execute(params) -> dict`，然后在 `base.py` 的 `_load_builtin_tools()` 中注册。

### services/ — 基础设施

| 文件 | 职责 | 关键函数 |
|------|------|----------|
| `context/` | 上下文窗口管理（折叠+裁剪+过滤） | `fold_tool_calls()`, `trim_messages()`, `filter_for_ai()` |
| `llm.py` | LLM统一接口（异步，AsyncOpenAI） | `async chat()` |
| `search.py` | 搜索服务（DuckDuckGo，可切换后端） | `search()` |
| `fetch.py` | 网页抓取服务（httpx异步） | `async fetch_url()` |
| `history.py` | SQLite存储 | `save_message()`, `load_session()`, `new_session()`, `get_session_info()`, `close_conn()` |
| `memory.py` | 记忆系统（异步摘要生成） | `async generate_summary()`, `get_memory_context()`, `async summarize_session()` |

### prompt/ — 提示词构建

| 文件 | 职责 | 关键函数 |
|------|------|----------|
| `builder.py` | 三明治提示词拼接（角色→工具→动态→角色保持） | `build_system_prompt()`, `build_messages()` |
| `character.py` | 角色管理 | `list_characters()`, `load_character()` |
| `template.py` | 模板变量系统 | `render_template()`, `render_messages()`, `collect_variables()` |

### types/ — 类型定义

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `messages.py` | 消息类型和元数据 | `MessageType`, `MessageMetadata`, `create_message()`, `is_folded()` |

---

## API 端点一览

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/chat/send` | 发消息（非流式） |
| `POST` | `/chat/stream` | 发消息（SSE流式） |
| `GET` | `/chat/history` | 获取聊天历史 |
| `POST` | `/sessions/new` | 创建新会话 |
| `POST` | `/sessions/load` | 加载已有会话 |
| `GET` | `/sessions/list` | 列出会话 |
| `DELETE` | `/sessions/{session_id}` | 删除会话 |
| `POST` | `/sessions/reset` | 重置会话 |
| `GET` | `/characters/list` | 列出角色 |
| `GET` | `/characters/{id}` | 获取角色详情 |
| `POST` | `/characters/switch` | 切换角色 |
| `GET` | `/config/list` | 列出可管理配置项 |
| `GET` | `/config/{resource}` | 读取配置（env/tools） |
| `POST` | `/config/{resource}` | 更新配置 |

---

## 常见操作定位

| 想要... | 去哪里... |
|---------|----------|
| 换模型/厂商 | `.env` + `lumen/config.py` |
| 添加新工具 | `lumen/tools/` 新建 `.py`，在 `base.py` 注册 |
| 创建新角色 | `characters/` 新建 `.json` |
| 修改对话逻辑 | `lumen/core/chat.py` |
| 修改记忆策略 | `lumen/services/memory.py` |
| 修改上下文长度 | `lumen/services/context/` |
| 修改桌面界面 | `lumen-Front/src/components/` |
| 修改后端API | `api/routes/` |
| 启动桌面应用 | `cd lumen-Front && pnpm tauri dev` |
| 启动后端服务 | `启动后端.bat`（Windows）或 `启动.sh`（Linux/Mac） |

---

## 更新日志

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-04-16 | config.py: OpenAI → AsyncOpenAI | 全链路异步化，消除同步/异步翻译层 |
| 2026-04-16 | llm.py: chat() 变异步 | 匹配 AsyncOpenAI SDK，返回异步迭代器 |
| 2026-04-16 | chat.py: chat_stream/chat_non_stream 变异步 | 核心层原生 async，不再需要线程池翻译 |
| 2026-04-16 | memory.py: generate_summary/summarize_session 变异步 | 调用链传播，chat() 已异步 |
| 2026-04-16 | session.py: switch_character 变异步 | 调用 summarize_session 需 await |
| 2026-04-16 | api/routes/chat.py: 删除线程池桥，改用 async for | 全链路异步后不再需要翻译 |
| 2026-04-16 | 前端：ChatInterface 暗色主题 + 流式显示 | Lumen视觉重设计，逐字输出+工具状态胶囊 |
| 2026-04-16 | 前端：useChat.ts 切换到 sendMessageStream | 接入后端SSE流式，实时显示 |
| 2026-04-16 | 前端：MarkdownContent + markdown.css | T2.1 Markdown渲染+语法高亮+流式光标 |
| 2026-04-16 | 前端：ChatSidebar + ChatPanel + 新ChatInterface | T2.2 文件结构整理，旧ChatInterface移入components/ |
| 2026-04-16 | 前端：api/session.ts + hooks/useSessions.ts + types/session.ts | T2.2 会话管理API客户端+Hook+类型 |
| 2026-04-16 | 前端：useChat 新增 session 管理 + 历史加载 | T2.2 自动创建会话、加载历史、清空消息 |
| 2026-04-16 | api/chat.ts 新增 getHistory + sendMessageStream 传 sessionId | T2.2 前端对接会话历史API |
| 2026-04-16 | session.py: create_new 修复 key bug + get_or_create DB 回退 | T2.2 修复session_id不一致和内存miss问题 |
| 2026-04-16 | history.py: 新增 get_session_info() | T2.2 支持从数据库查询会话基本信息 |
| 2026-04-16 | api/chat.py: /chat/history 内存miss时回退数据库 | T2.2 后端重启后也能加载历史 |
| 2026-04-16 | 新增 services/fetch.py + tools/web_fetch.py | T1 新增网页抓取工具（httpx异步） |
| 2026-04-15 | 新增 services/search.py 搜索服务 | 搜索引擎是基础设施，按架构哲学归 services 层 |
| 2026-04-15 | 新增 tools/web_search.py 网页搜索工具 | 让 AI 能搜索互联网实时信息 |
| 2026-04-15 | registry.json 新增 web_search 定义 | 工具定义注册 |
| 2026-04-15 | validate_tool_call 用 jsonschema 重构 | 标准库替代手写if，以后加新工具不用改验证代码 |
| 2026-04-15 | api/main.py 添加 logging 配置 | 让 lumen 模块的 logger.info() 在终端可见 |
| 2026-04-15 | chat_stream 新增退出原因追踪 | 区分正常完成/工具后完成/达到轮次上限，方便调试和前端展示 |
| 2026-04-15 | MAX_TOOL_ITERATIONS 移到 config.py | 运行时可调，不再硬编码在 chat.py 里 |
| 2026-04-15 | context.py 从 core/ 迁移到 services/context/ | 上下文管理是基础设施，不是业务逻辑；为后续多层压缩策略预留空间 |
| 2026-04-15 | chat.py 改造为 ReAct 循环 | 支持多轮工具调用（最多10轮），AI可链式调用工具直到任务完成 |
| 2026-04-15 | builder.py 新增角色保持层 | 三明治底层，防止工具调用后 AI 掉角色 |
| 2026-04-15 | context.py 实现 fold_tool_calls() | 折叠已完成的工具调用对，节省上下文 token |
| 2026-04-15 | 新增 prompt/template.py | 全局模板变量系统，`{{xxx}}` 在任何发给AI的文本中替换 |
| 2026-04-15 | 新增 api/routes/config.py | 统一配置管理API，前端一个入口管所有配置 |
| 2026-04-15 | 删除 get_current_time 工具 | 被 `{{date_time}}` 模板变量替代 |
| 2026-04-15 | characters/ 和 data/ 移入 lumen/ | 后端数据归后端，根目录只留项目级配置 |
| 2026-04-15 | 修复 history.py/prompt.py/API路由 | 连接复用、安全校验、HTTP方法规范化 |
| 2026-04-14 | 全面重构目录结构 | 参考Claude Code架构哲学，按系统角色分层 |
| 2026-04-14 | tools.py 拆分为 base/parse/各工具 | 单一职责，新工具只需加文件 |
| 2026-04-14 | prompt.py 拆分为 builder/character | 角色管理和提示词构建分离 |

---

**维护规则**：见 [memory/code_index_rules.md](memory/code_index_rules.md)
- 增删文件时必须更新
- 职责变化时必须更新
- 新会话启动时优先读取
