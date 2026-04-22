# Lumen 代码结构索引

> **用途**：新会话读此文件了解项目文件布局和模块依赖。
> **维护**：增删文件或改变职责时更新。规则见 CLAUDE.md 工作流程第 2 条。

**最后更新**：2026-04-22（知识库 P1-c 占位符解析器 + system prompt 内检索替换）

---

## 目录结构

```
Lumen/
├── lumen/                        # 核心代码包（按角色分层）
│   ├── config.py                 # 全局配置（AsyncOpenAI客户端、模型选择、日志系统 setup_logging）
│   ├── tool.py                   # 工具执行引擎（注册、执行、并行调度、结果格式化）— 对标 CC Tool.ts
│   ├── query.py                  # 查询引擎（ReAct 循环、SSE 流式、软静默工具检测、Think标签事件流、知识库注入+占位符解析）— 对标 CC query.ts
│   ├── characters/               # 角色数据（JSON）+ 头像资源（avatars/）
│   ├── personas/                 # Persona 用户身份数据（JSON，每个身份一个文件）
│   ├── worldbooks/               # 世界书数据（JSON，每个条目一个文件）
│   ├── skills/                   # Skills 数据（目录结构：skill-name/SKILL.md + YAML frontmatter，含 README.md 开发指南）
│   ├── data/                     # 运行时数据（history.db、file_workspaces.json、active_persona.json、mcp_servers.json、knowledge.tdb、knowledge/）
│   │
│   ├── core/                     # 大脑 — 会话状态
│   │   └── session.py            # 会话生命周期（内存+DB双查，Persona切换后reload）
│   │
│   ├── tools/                    # 双手 — 每个工具一个 .py（基类在根目录 tool.py）
│   │   ├── parse.py              # AI输出 → 工具调用 解析（JSON修复层 + 结构检测 + 花括号提取）
│   │   ├── registry.py           # 工具注册中心（CRUD、验证）
│   │   ├── registry.json         # 工具定义数据（含 usage_guide 字段）
│   │   ├── types.py              # 兼容层：从 lumen.types.tools 导入 ErrorCode/ToolDefinition
│   │   ├── file_security.py      # 文件安全层（工作区白名单+系统黑名单+路径验证）
│   │   ├── calculate.py          # 计算器
│   │   ├── web_search.py         # 网页搜索（→ services/search.py）
│   │   ├── web_fetch.py          # 网页抓取（→ services/fetch.py）
│   │   ├── file_read.py          # 文件读取（read/list/glob/grep/info）
│   │   ├── file_write.py         # 文件写入（write/edit/append/copy/move/rename/delete/mkdir/download）
│   │   ├── skill_script.py       # Skill 脚本安全执行器（子进程+超时+输出截断+哈希白名单）
│   │   └── lumen_skill_api.py    # Skill 脚本工具 API（search/fetch/read_file/list_files/calculate）
│   │
│   ├── services/                 # 神经 — 基础设施
│   │   ├── context/              # 上下文管理（token计数、折叠、裁剪、compact）
│   │   │   ├── token_estimator.py # Token计数器（Protocol接口+tiktoken实现+API校准+用量追踪）
│   │   │   └── compact.py        # Compact 服务（阈值检测+摘要压缩+消息替换）
│   │   ├── ws_manager.py         # WebSocket连接管理器（单例、广播、心跳）
│   │   ├── mcp_client.py         # MCP 客户端服务（连接外部MCP服务器、发现工具、调用工具）
│   │   ├── llm.py                # LLM适配器（AsyncOpenAI）
│   │   ├── search.py             # 搜索服务（DuckDuckGo）
│   │   ├── fetch.py              # 网页抓取服务（httpx异步）
│   │   ├── history.py            # SQLite持久化（会话、消息、摘要、FTS5全文索引、向量级联删除）
│   │   ├── memory.py             # 记忆系统（异步摘要、记忆注入、向量+BM25 RRF混合检索、噪音过滤、去重）
│   │   ├── vector_store.py       # 向量存储（TriviumDB，语义搜索 + 按会话/角色级联删除）
│   │   ├── embedding.py          # 文本嵌入（gte-small-zh，sentence-transformers 单例）
│   │   ├── knowledge.py          # 知识库存储（TriviumDB 单例、文件导入/切分/向量化/语义搜索/删除，独立 knowledge.tdb）
│   │   ├── chunker.py            # 文本分块器（句子边界感知，支持重叠，用于知识库向量化）
│   │   ├── knowledge_resolver.py # 知识库占位符解析器（正则匹配 {{}}/[[]]，RAG/全文检索，替换注入 system prompt）
│   │   └── emotion.py            # 【预留】情感引擎
│   │
│   ├── prompt/                   # 嘴巴 — 提示词构建
│   │   ├── builder.py            # 系统提示词拼接（角色+Persona+Skills+工具+世界书+动态注入，三明治结构）+ 分层调试构建
│   │   ├── tool_prompt.py        # 工具提示词生成（<tools> 格式，例子驱动 + 英文规则）
│   │   ├── skill_store.py        # Skills 数据管理（目录结构 CRUD + 富 frontmatter + 渐进式注入 + 脚本调用）
│   │   ├── persona.py            # Persona 数据管理（JSON CRUD + 激活状态 + 注入文本生成）
│   │   ├── authors_note.py       # Author's Note 数据管理（DB CRUD + 缓存 + 注入消息生成）
│   │   ├── worldbook_store.py    # 世界书数据管理（JSON CRUD + 缓存 + 列表）
│   │   ├── worldbook_matcher.py  # 世界书关键词匹配引擎（扫描消息→匹配关键词→返回注入内容）
│   │   ├── character.py          # 角色卡片加载 + CRUD + 头像管理
│   │   └── template.py           # 模板变量系统（{{xxx}} 替换）
│   │
│   └── types/                    # 词汇 — 类型定义
│       ├── messages.py           # 消息类型（TypedDict）+ 工厂函数
│       ├── events.py             # SSE 事件类型（含 MemoryDebugEvent + RecallLogEntry 召回详情）
│       ├── ws_events.py          # WebSocket 推送事件类型（TypedDict）
│       ├── tools.py              # 工具协议类型（Pydantic）+ ErrorCode 常量 + ToolDefinition TypedDict
│       ├── prompt.py             # 提示词类型（CharacterCard Pydantic + DynamicContext TypedDict）
│       ├── persona.py            # Persona 类型（PersonaCard + ActivePersona Pydantic 模型）
│       ├── authors_note.py       # Author's Note 类型（AuthorsNoteConfig + UpdateRequest）
│       ├── worldbook.py          # 世界书类型（WorldBookEntry + WorldBookListItem Pydantic 模型）
│       └── skills.py             # Skills 类型（SkillCard + SkillCreateRequest + SkillUpdateRequest Pydantic 模型）
│       └── knowledge.py          # 知识库类型（KnowledgeFileCard + KnowledgeSearchRequest + KnowledgeSearchResult Pydantic 模型）
│
├── api/                          # FastAPI HTTP接口
│   ├── main.py                   # 应用入口、CORS、路由注册
│   └── routes/
│       ├── chat.py               # 聊天（send/stream/history/compact/token-usage/cancel + memory_debug + Think事件）
│       ├── session.py            # 会话（new/load/list/delete/reset）
│       ├── character.py          # 角色（list/get/switch/create/update/delete/upload-avatar）
│       ├── persona.py            # Persona（list/get/active/create/update/delete/switch）
│       ├── authors_note.py       # Author's Note（get/save/delete，每会话独立）
│       ├── worldbook.py          # 世界书（list/get/create/update/delete，文件存储）
│       └── skills.py             # Skills（list/get/create/update/delete/upload/invoke，Markdown 目录存储）
│       ├── knowledge.py          # 知识库（list/get/upload/create/search/delete，文件切分+向量化+语义搜索）
│       ├── avatar.py             # 头像管理（upload/list/delete，文件存储到 characters/avatars/）
│       ├── models.py             # 模型（list，从 LiteLLM 代理获取可用模型）
│       ├── config.py             # 配置（list/read/update）
│       └── ws.py                 # WebSocket 推送端点（/ws/push）
│
├── lumen-Front/                  # 前端（Tauri 2 桌面应用）
│   └── src/
│       ├── App.tsx               # 应用入口（HashRouter 路由 + Overlay 挂载点）
│       ├── api/                  # HTTP 客户端（chat, session, character, config, ws, persona, authorNote, worldbook, avatar, models, skills）
│       ├── commands/             # 斜杠命令（registry 注册中心 + builtin 内置命令）
│       ├── hooks/                # 状态管理（useChat, useSessions, useCharacters, useConfig, usePush, usePersona, useAuthorNote, useWorldBook, useSkills）— localStorage 持久化（角色/会话恢复）
│       ├── components/           # UI 组件（ChatInterface, Sidebar, Panel, MarkdownContent, CommandPalette, CharacterSelector, PersonaPanel, WorldBookPanel, AuthorNotePanel, PromptDebugPanel, DebugDrawer, EnvForm, WorkspacesEditor, PushNotification, ModelSelect）
│       ├── pages/                # 页面组件（CharacterList, CharacterEditor, PersonaList, PersonaEditor, WorldBookList, WorldBookEditor, SkillList, SkillEditor, AvatarManager, ConfigList, ConfigEditor, TokenInspector）
│       ├── types/                # 类型定义（session, character, persona, authorNote, worldbook, avatar, config, push, skills）
│       └── styles/               # 样式（index.css 含 CSS 变量, App.css, markdown.css）
│
├── tests/                        # 测试
├── requirements.txt              # Python依赖
└── .env                          # 环境配置（API_URL, API_KEY, MODEL）
```

---

## 核心依赖链

```
api/routes/chat.py ──→ lumen/query.py（ReAct 主循环）
                          ├── core/session.py（会话状态 + reload_system_prompt）
                          ├── services/context/（token计数+折叠+裁剪+compact）
                          ├── services/llm.py（LLM调用）
                          ├── services/history.py（持久化）
                          ├── services/memory.py（记忆注入）
                          ├── services/knowledge.py（知识库检索注入）
                          ├── tool.py（工具执行引擎）
                          ├── tools/parse.py（工具解析）
                          ├── tools/registry.py（工具验证）
                          ├── prompt/builder.py（提示词拼接）
                          │    ├── prompt/tool_prompt.py（工具提示词生成）
                          │    ├── prompt/persona.py（Persona 注入文本）
                          │    └── prompt/authors_note.py（Author's Note 注入）
                          └── config.py（模型配置）
```

---

## API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/chat/send` | 发消息（非流式） |
| `POST` | `/chat/stream` | 发消息（SSE流式） |
| `GET` | `/chat/history` | 聊天历史 |
| `POST` | `/chat/compact` | 手动触发上下文压缩 |
| `GET` | `/chat/token-usage` | 查看 token 使用情况 |
| `POST` | `/sessions/new` | 创建会话 |
| `POST` | `/sessions/load` | 加载会话 |
| `GET` | `/sessions/list` | 会话列表 |
| `DELETE` | `/sessions/{id}` | 删除会话 |
| `POST` | `/sessions/reset` | 重置会话 |
| `GET` | `/characters/list` | 角色列表 |
| `GET` | `/characters/{id}` | 角色详情 |
| `POST` | `/characters/switch` | 切换角色 |
| `POST` | `/characters/create` | 创建角色（含头像上传） |
| `PUT` | `/characters/{id}` | 更新角色（含头像上传） |
| `DELETE` | `/characters/{id}` | 删除角色 |
| `POST` | `/characters/upload-avatar` | 上传头像 |
| `GET` | `/avatars/list` | 头像列表 |
| `POST` | `/avatars/upload` | 上传头像文件 |
| `DELETE` | `/avatars/{id}` | 删除头像 |
| `GET` | `/personas/list` | Persona 列表 |
| `GET` | `/personas/active` | 当前激活的 Persona |
| `GET` | `/personas/{id}` | Persona 详情 |
| `POST` | `/personas/create` | 创建 Persona |
| `PUT` | `/personas/{id}` | 更新 Persona |
| `DELETE` | `/personas/{id}` | 删除 Persona |
| `POST` | `/personas/switch` | 切换激活的 Persona（刷新所有会话） |
| `GET` | `/authors-note/{session_id}` | 获取会话的 Author's Note |
| `PUT` | `/authors-note/{session_id}` | 创建或更新 Author's Note |
| `DELETE` | `/authors-note/{session_id}` | 删除 Author's Note |
| `GET` | `/worldbooks/list` | 世界书条目列表 |
| `GET` | `/worldbooks/{id}` | 世界书条目详情 |
| `POST` | `/worldbooks/create` | 创建世界书条目 |
| `PUT` | `/worldbooks/{id}` | 更新世界书条目 |
| `DELETE` | `/worldbooks/{id}` | 删除世界书条目 |
| `GET` | `/skills/list` | Skills 列表 |
| `GET` | `/skills/{id}` | Skill 详情 |
| `POST` | `/skills/create` | 创建 Skill |
| `PUT` | `/skills/{id}` | 更新 Skill |
| `DELETE` | `/skills/{id}` | 删除 Skill |
| `POST` | `/skills/upload` | 上传导入 Skill（.md / .zip） |
| `GET` | `/skills/invoke/{id}` | 懒加载调用 Skill（含脚本执行） |
| `GET` | `/knowledge/list` | 知识库文件列表 |
| `GET` | `/knowledge/{file_id}` | 知识库文件元数据 |
| `POST` | `/knowledge/upload` | 上传文件并自动切分向量化 |
| `POST` | `/knowledge/create` | 直接文本创建知识库条目 |
| `POST` | `/knowledge/search` | 语义搜索知识库 |
| `DELETE` | `/knowledge/{file_id}` | 删除知识库文件及向量 |
| `GET` | `/models/list` | 获取可用模型列表 |
| `GET` | `/config/list` | 配置项列表 |
| `GET` | `/config/{resource}` | 读取配置 |
| `POST` | `/config/{resource}` | 更新配置 |
| `WS` | `/ws/push` | WebSocket 推送通道（心跳 + AI 主动消息 + 通知） |
