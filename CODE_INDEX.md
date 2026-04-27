# Lumen 代码结构索引

> **用途**：新会话读此文件了解项目文件布局和模块依赖。
> **维护**：增删文件或改变职责时更新。规则见 CLAUDE.md 工作流程第 2 条。

**最后更新**：2026-04-27（两阵营嵌入架构 + 富文本编辑器 + 工具合并 + 图谱API + 缓冲区前后端）

---

## 目录结构

```
Lumen/
├── lumen/                        # 核心代码包（按角色分层）
│   ├── config.py                 # 全局配置（AsyncOpenAI客户端、模型选择、日志系统 setup_logging）
│   ├── tool.py                   # 工具执行引擎（注册、执行、并行调度、结果格式化）— 对标 CC Tool.ts
│   ├── query.py                  # 查询引擎（ReAct 循环、SSE 流式、Think标签事件流、知识库注入+占位符解析、回复风格注入）— 对标 CC query.ts
│   ├── characters/               # 角色数据（JSON）+ 头像资源（avatars/）
│   ├── personas/                 # Persona 用户身份数据（JSON，每个身份一个文件）
│   ├── worldbooks/               # 世界书数据（JSON，每个条目一个文件）
│   ├── skills/                   # Skills 数据（目录结构：skill-name/SKILL.md + YAML frontmatter，含 README.md 开发指南）
│   ├── data/                     # 运行时数据（history.db、thinking_clusters/、vectors/api/knowledge.tdb、vectors/local/memory.tdb 等）
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
│   │   ├── file_manager.py       # 文件读写合并（read/write/edit/list/glob/grep/copy/move/delete等）
│   │   ├── web.py                # 网页搜索+抓取合并（search→DuckDuckGo, fetch→httpx异步）
│   │   ├── calculate.py          # 计算器
│   │   ├── daily_note.py         # AI 日记工具（创建/编辑/列表/搜索/缓冲模式写入）
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
│   │   ├── vector_store.py       # 向量存储（TriviumDB，语义搜索 + 按会话/角色级联删除 + .dim 一致性检查）
│   │   ├── embedding.py          # 文本嵌入（两阵营架构：A-本地小模型512维/B-API大模型，多后端 LocalBackend/OpenAI/Gemini）
│   │   ├── knowledge.py          # 知识库存储（TriviumDB 单例、文件导入/切分/向量化/语义搜索/删除、.dim 一致性检查）
│   │   ├── buffer.py             # 记忆缓冲区（小模型向量临时存储+检索，批量整理后大模型重算写入正式库，独立 buffer.tdb，is_enabled 读运行时配置，新增 has_data/update_content）
│   │   ├── runtime_config.py     # 运行时配置服务（持久化到 runtime_config.json，线程安全读写）
│   │   ├── thinking_clusters.py  # 思维簇引擎（VCP MetaThinkingManager 重实现：索引、链式检索、向量融合、降级模式、token 预算）
│   │   ├── chunker.py            # 文本分块器（句子边界感知，支持重叠，用于知识库向量化）
│   │   ├── knowledge_resolver.py # 知识库占位符解析器（正则匹配 {{}}/[[]]，RAG/全文检索，替换注入 system prompt）
│   │   ├── consolidation.py     # 记忆整理服务（缓冲区→正式库，小模型→大模型向量重算）
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
│   │   ├── template.py           # 模板变量系统（{{xxx}} 替换）
│   │   └── thinking_injector.py  # 思维簇注入文本格式化（<thinking_modules> 标签，按簇分组+相似度排序）
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
│       └── thinking_clusters.py  # 思维簇类型（ChainStep/ChainConfig Pydantic + RetrievedModule/PipelineResult TypedDict）
│
├── api/                          # FastAPI HTTP接口
│   ├── main.py                   # 应用入口、CORS、路由注册（含 graph 路由）
│   └── routes/
│       ├── chat.py               # 聊天（send/stream/history/compact/token-usage/cancel/message-edit-delete + memory_debug + Think事件 + response_style）
│       ├── session.py            # 会话（new/load/list/delete/reset）
│       ├── character.py          # 角色（list/get/switch/create/update/delete/upload-avatar）
│       ├── persona.py            # Persona（list/get/active/create/update/delete/switch）
│       ├── authors_note.py       # Author's Note（get/save/delete，每会话独立）
│       ├── worldbook.py          # 世界书（list/get/create/update/delete，文件存储）
│       └── skills.py             # Skills（list/get/create/update/delete/upload/invoke，Markdown 目录存储）
│       ├── knowledge.py          # 知识库（list/get/upload/create/search/delete，文件切分+向量化+语义搜索）
│       ├── tdb.py                # TDB 通用浏览（条目 CRUD + 文件树 + 从磁盘导入 + 去重 + 编辑同步源文件）
│       ├── graph.py              # 图谱 CRUD API（实体/边/邻居查询，通用支持任意 TDB）
│       ├── avatar.py             # 头像管理（upload/list/delete，文件存储到 characters/avatars/）
│       ├── models.py             # 模型（list，从 LiteLLM 代理获取可用模型）
│       ├── config.py             # 配置（list/read/update）+ 缓冲区设置 API + TDB 列表 API
│       └── ws.py                 # WebSocket 推送端点（/ws/push）
│
├── lumen-Front/                  # 前端（Tauri 2 桌面应用）
│   ├── tailwind.config.js        # Tailwind 配置（覆盖 slate/amber 色阶为暖灰色调）
│   └── src/
│       ├── App.tsx               # 应用入口（HashRouter 路由 + Overlay 挂载点）
│       ├── api/                  # HTTP 客户端（chat, session, character, config, ws, persona, authorNote, worldbook, avatar, models, skills, knowledge, graph, buffer, tdb）
│       ├── commands/             # 斜杠命令（registry 注册中心 + builtin 内置命令）
│       ├── hooks/                # 状态管理（useChat, useSessions, useCharacters, useConfig, usePush, usePersona, useAuthorNote, useWorldBook, useSkills, useKnowledge）— localStorage 持久化（角色/会话恢复）
│       ├── components/           # UI 组件（ChatInterface, ChatPanel[VCP内联工具气泡], NavRail, RightRail, MarkdownContent, CommandPalette, MemoryWindow[TDB标签页+条目/文件双视图+chunk编辑+导入], FloatingLayerHost, GraphEditor[力导向图+Canvas+CRUD], editors/[RichTextEditor+TipTap富文本]...）
│       ├── pages/                # 页面组件（CharacterList, CharacterEditor, PersonaList, PersonaEditor, WorldBookList, WorldBookEditor, SkillList, SkillEditor, AvatarManager, ConfigList, ConfigEditor, TokenInspector, KnowledgeList, BufferSettingsPage[开关/整理模型/统计]）
│       ├── types/                # 类型定义（session, character, persona, authorNote, worldbook, avatar, config, push, skills, knowledge）
│       └── styles/               # 样式（index.css 含 CSS 变量, App.css, markdown.css, editor.css 暖灰富文本主题）
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
                          ├── services/thinking_clusters.py（思维簇注入）
                          ├── services/embedding.py（两阵营嵌入：本地512维 + API大模型）
                          ├── tool.py（工具执行引擎）
                          ├── tools/parse.py（工具解析）
                          ├── tools/registry.py（工具验证）
                          ├── prompt/builder.py（提示词拼接）
                          │    ├── prompt/tool_prompt.py（工具提示词生成）
                          │    ├── prompt/persona.py（Persona 注入文本）
                          │    ├── prompt/thinking_injector.py（思维簇注入文本）
                          │    └── prompt/authors_note.py（Author's Note 注入）
                          └── config.py（模型配置 + 每服务嵌入配置）
```

---

## API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/chat/send` | 发消息（非流式） |
| `POST` | `/chat/stream` | 发消息（SSE流式，含 response_style） |
| `GET` | `/chat/history` | 聊天历史（含消息 id） |
| `PATCH` | `/chat/message` | 编辑消息 |
| `DELETE` | `/chat/message` | 删除消息 |
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
| `GET` | `/graph/entities` | 图谱实体列表（支持任意 TDB） |
| `POST` | `/graph/entities` | 创建图谱实体 |
| `GET` | `/graph/edges` | 图谱边列表 |
| `POST` | `/graph/edges` | 创建图谱边 |
| `GET` | `/graph/neighbors` | 查询实体邻居 |
| `DELETE` | `/graph/entities/{id}` | 删除图谱实体 |
| `DELETE` | `/graph/edges/{id}` | 删除图谱边 |
| `GET` | `/config/buffer/settings` | 缓冲区设置（开关、整理模型） |
| `POST` | `/config/buffer/settings` | 更新缓冲区设置 |
| `GET` | `/config/tdb/list` | TDB 数据库列表 |
| `GET` | `/tdb/{name}/entries` | TDB 条目列表（分页+过滤） |
| `GET` | `/tdb/{name}/stats` | TDB 条目统计 |
| `PUT` | `/tdb/{name}/entries/{id}` | 更新条目（含重向量化和源文件同步） |
| `DELETE` | `/tdb/{name}/entries/{id}` | 删除条目 |
| `GET` | `/tdb/{name}/file-tree` | 源文件目录树 |
| `POST` | `/tdb/{name}/import-file` | 从磁盘导入文件（去重） |
| `WS` | `/ws/push` | WebSocket 推送通道（心跳 + AI 主动消息 + 通知） |
