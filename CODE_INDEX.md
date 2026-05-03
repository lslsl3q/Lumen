# Lumen 代码结构索引

> **用途**：新会话读此文件了解项目文件布局和模块依赖。
> **维护**：增删文件或改变职责时更新。规则见 CLAUDE.md 工作流程第 2 条。

**最后更新**：2026-05-03（T25 GM Agent 完整构建 + T11 Phase D 三模式状态机）

---

## 目录结构

```
Lumen/
├── lumen/                        # 核心代码包（按角色分层）
│   ├── config.py                 # 全局配置（AsyncOpenAI客户端、模型选择、两阵营嵌入、SPARSE_EMBEDDING_ENABLED、日记目录）
│   ├── tool.py                   # 工具执行引擎（注册、执行、并行调度、结果格式化）— 对标 CC Tool.ts
│   ├── query.py                  # [DEPRECATED: T24] 查询引擎（旧 ReAct 循环入口，保留供非流式 chat_non_stream 使用）
│   ├── agent.py                  # T24 Agent 容器（组件列表 + 信箱 + state + act() 流式决策）
│   ├── agent_chat.py             # T24 Agent Chat 入口（创建 Agent → 注册 Components → agent.act() → yield SSEEvent）
│   │
│   ├── components/               # T24 Component 包 — Concordia 风格可插拔组件
│   │   ├── base.py               # ContextComponent（pre_act→str）+ ActingComponent（decide→AsyncGenerator[dict]）+ PromptZone枚举（STATIC/DYNAMIC）+ zone属性
│   │   ├── identity.py           # 角色身份（名字+描述+system_prompt+Persona+回复风格，priority=10）
│   │   ├── lore.py               # 世界书+知识库语义检索+占位符解析（priority=20）
│   │   ├── memory.py             # 跨会话记忆检索（priority=30）
│   │   ├── skills.py             # Skills 渐进式注入（priority=50）
│   │   ├── thinking_cluster.py   # 思维簇管道注入（priority=60）
│   │   ├── tool.py               # 工具说明+角色保持指令（priority=90）
│   │   ├── room_context.py       # T25 房间上下文注入（当前房间实体映射，priority=25，Gemini Trap 1 防御）
│   │   ├── gm_identity.py        # T25 GM DM 人格组件（STATIC, priority=10, 从 data/gm/identity.md 热加载）
│   │   ├── gm_world_context.py   # T25 GM 世界上下文组件（DYNAMIC, priority=30, 房间+实体+近期事件）
│   │   ├── gm_resolution.py      # T25 GM 裁决规则组件（STATIC, priority=50, 4步裁决法+JSON schema）
│   │   └── react_acting.py       # ReAct 决策循环（LLM→工具→结果→再LLM + _yield_rpg_state + 思考链双轨处理 + T29双system消息构建 + 流式缓存统计）
│   ├── characters/               # 角色数据（JSON）+ 头像资源（avatars/）
│   │   ├── default.json           # 默认助手（calculate/web/file_manager/daily_note）
│   │   ├── rpg_gm.json            # RPG 游戏主持人（calculate/dice/rpg）
│   ├── personas/                 # Persona 用户身份数据（JSON，每个身份一个文件）
│   ├── worldbooks/               # 世界书数据（JSON，每个条目一个文件）
│   ├── skills/                   # Skills 数据（目录结构：skill-name/SKILL.md + YAML frontmatter，含 README.md 开发指南）
│   ├── data/                     # 运行时数据（history.db、thinking_clusters/、vectors/、graph/extract_prompt.md 等）
│   │
│   ├── core/                     # 大脑 — 会话状态 + 反思管道 + 深梦境 + RPG 环境
│   │   ├── session.py            # 会话生命周期（内存+DB双查，Persona切换后reload）
│   │   ├── reflection.py         # T22 Step 3 反思管道编排器（asyncio.Queue消费者 + 三步触发 + LLM五维分类 + 存储路由）
│   │   ├── dream.py              # T22 Step 4 深梦境系统（涟漪召回+梦境叙事生成+定时调度+投入热反思管道）
│   │   ├── message_bus.py        # T25 消息总线（send_to/broadcast/rooms + 全局单例）
│   │   ├── environments/         # T25 模式环境
│   │   │   ├── base.py           # BaseEnvironment 抽象基类（register_agent + process_message）
│   │   │   ├── gm.py             # GMEnvironment（4步裁决链 + GM Agent ReAct + AsyncGenerator SSE + NPC异步广播）
│   │   │   ├── gm_agent.py       # T25 GM Agent 构建器（无状态临时Agent + 4组件 + gm_chat_stream核心入口）
│   │   │   └── narrative_parser.py # T25 叙事解析器（markdown剥离 + JSON解析 + 降级兜底）
│   │   └── reflection_README.md  # T22 反思系统模块说明书（架构+数据流+扩展指南）
│   │
│   ├── tools/                    # 双手 — 每个工具一个 .py（基类在根目录 tool.py）
│   │   ├── parse.py              # AI输出 → 工具调用 解析（JSON修复层 + 结构检测 + 花括号提取）
│   │   ├── registry.py           # 工具注册中心（CRUD、验证）
│   │   ├── registry.json         # 工具定义数据（含 usage_guide 字段 + dice + rpg 命令集）
│   │   ├── types.py              # 兼容层：从 lumen.types.tools 导入 ErrorCode/ToolDefinition
│   │   ├── file_security.py      # 文件安全层（工作区白名单+系统黑名单+路径验证）
│   │   ├── file_manager.py       # 文件读写合并（read/write/edit/list/glob/grep/copy/move/delete等）
│   │   ├── web.py                # 网页搜索+抓取合并（search→DuckDuckGo, fetch→httpx异步）
│   │   ├── calculate.py          # 计算器
│   │   ├── daily_note.py         # AI 日记工具（YAML frontmatter + agent_knowledge.tdb 阵营B写入 + 按Agent分目录 + 反思触发器 + 梦境通知）
│   │   ├── dice.py               # T25 掷骰工具（NdS[+M] 表达式解析）
│   │   ├── rpg.py                # T25 RPG 工具集（move_to/roll_check/resolve_attack，WorldState+MessageBus联动）
│   │   ├── skill_script.py       # Skill 脚本安全执行器（子进程+超时+输出截断+哈希白名单）
│   │   └── lumen_skill_api.py    # Skill 脚本工具 API（search/fetch/read_file/list_files/calculate）
│   │
│   ├── services/                 # 神经 — 基础设施（T24 子目录重组）
│   │   ├── context/              # 上下文管理（token计数、折叠、裁剪、compact）
│   │   │   ├── token_estimator.py # Token计数器（Protocol接口+tiktoken实现+API校准+用量追踪）
│   │   │   └── compact.py        # Compact 服务（阈值检测+摘要压缩+消息替换）
│   │   ├── memory/               # T24 记忆子目录（_core.py=原memory.py, simhash.py）
│   │   │   ├── __init__.py       # 导出：generate_summary, get_memory_context, vectorize_message, get_relevant_memories, compute, hamming_distance...
│   │   │   ├── _core.py          # 记忆系统核心（异步摘要、记忆注入、向量+BM25 RRF混合检索）
│   │   │   └── simhash.py        # T22 SimHash 64位指纹（jieba分词+SHA-256+TF加权投票+8维情绪位元）
│   │   ├── knowledge/            # T24 知识库子目录（_core.py=原knowledge.py, scanner/manifest/chunker）
│   │   │   ├── __init__.py       # 导出：search, upload, list_files, scan, _get_db, _get_agent_db...
│   │   │   ├── _core.py          # 知识库存储核心（双库、access_list、导入/切分/搜索/删除）
│   │   │   ├── scanner.py        # T23 扫描服务（MD5变更检测、新知识库发现）
│   │   │   ├── manifest.py       # T23 注册表（_manifest.json 读写、注册/注销/列表）
│   │   │   └── chunker.py        # 文本分块器（句子边界感知，支持重叠）
│   │   ├── graph/                # T24 图谱子目录（_core.py=原graph.py, extract/backup）
│   │   │   ├── __init__.py       # 导出：find_entity_by_name, upsert_entity, upsert_edge, batch_upsert...
│   │   │   ├── _core.py          # T19 图谱核心服务（实体Upsert、边管理、邻居文本召回）
│   │   │   ├── extract.py        # T19 图谱提取管道（文本→LLM抽取→batch_upsert）
│   │   │   └── backup.py         # 图谱备份/恢复（JSON导出+Git提交）
│   │   ├── ws_manager.py         # WebSocket连接管理器（单例、广播、心跳）
│   │   ├── mcp_client.py         # MCP 客户端服务（连接外部MCP服务器、发现工具、调用工具）
│   │   ├── llm.py                # LLM适配器（AsyncOpenAI + build_thinking_params 跨模型翻译 + extra_body/reasoning_effort 透传 + 缓存统计日志）
│   │   ├── search.py             # 搜索服务（DuckDuckGo）
│   │   ├── fetch.py              # 网页抓取服务（httpx异步）
│   │   ├── history.py            # SQLite持久化（会话、消息、摘要、FTS5全文索引、向量级联删除）
│   │   ├── world_state.py        # T25 RPG 世界状态黑板（SQLite：位置/HP/属性/房间/rpg_events事件记录，线程安全）
│   │   ├── vector_store.py       # 向量存储（TriviumDB，语义搜索 + 按会话/角色级联删除 + .dim 一致性检查）
│   │   ├── embedding.py          # 文本嵌入（两阵营架构 + 稀疏向量 encode_with_sparse + instruction_type 预留）
│   │   ├── sparse_store.py       # 稀疏向量存储（SQLite + In-memory 缓存 + Dot Product 搜索，T25）
│   │   ├── runtime_config.py     # 运行时配置服务（持久化到 runtime_config.json，线程安全读写）
│   │   ├── thinking_clusters.py  # 思维簇引擎（VCP MetaThinkingManager 重实现：索引、链式检索、向量融合、降级模式、token 预算）
│   │   ├── knowledge_resolver.py # 知识库占位符解析器（正则匹配 {{}}/[[]]，RAG/全文检索，替换注入 system prompt）
│   │   └── emotion.py            # 【预留】情感引擎
│   │
│   ├── events/                   # T22 事件总线 — 后端心智引擎内部事件流转
│   │   ├── __init__.py           # 包导出（ReflectionEvent, SourceType, EventBus）
│   │   ├── schema.py             # 事件Schema（ReflectionEvent + SourceType 5种数据源 + ReflectionTrigger）
│   │   └── bus.py                # 极简pub/sub（单例EventBus，同步/异步handler分发）
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
│   │   ├── graph_extract.py      # T19 图谱提取 Prompt（文件热加载 + markdown 解析 + 默认值回退）
│   │   └── thinking_injector.py  # 思维簇注入文本格式化（<thinking_modules> 标签，按簇分组+相似度排序）
│   │
│   └── types/                    # 词汇 — 类型定义
│       ├── messages.py           # 消息类型（TypedDict）+ 工厂函数
│       ├── agent_message.py      # T25 多Agent通信消息（MsgType 枚举 + AgentMessage TypedDict）
│       ├── events.py             # SSE 事件类型（含 MemoryDebugEvent + RecallLogEntry 召回详情）
│       ├── ws_events.py          # WebSocket 推送事件类型（TypedDict）
│       ├── tools.py              # 工具协议类型（Pydantic）+ ErrorCode 常量 + ToolDefinition TypedDict
│       ├── prompt.py             # 提示词类型（CharacterCard + ThinkingConfig + accessible_knowledge + DynamicContext TypedDict）
│       ├── persona.py            # Persona 类型（PersonaCard + ActivePersona Pydantic 模型）
│       ├── authors_note.py       # Author's Note 类型（AuthorsNoteConfig + UpdateRequest）
│       ├── worldbook.py          # 世界书类型（WorldBookEntry + WorldBookListItem Pydantic 模型）
│       └── skills.py             # Skills 类型（SkillCard + SkillCreateRequest + SkillUpdateRequest Pydantic 模型）
│       └── knowledge.py          # 知识库类型（KnowledgeFileCard + access_list/owner_id/file_id + KnowledgeSearchRequest/Result）
│       └── thinking_clusters.py  # 思维簇类型（ChainStep/ChainConfig Pydantic + RetrievedModule/PipelineResult TypedDict）
│       └── reflection.py         # T22 反思输出类型（五维分类+存储路由+卡片状态[active/needs_resolution/draft]+ReflectionOutput数组）
│       └── dream.py              # T22 Step 4 深梦境类型（DreamState+DreamResult+RippleEntry）
│
├── api/                          # FastAPI HTTP接口
│   ├── main.py                   # 应用入口、CORS、路由注册（含反思管道+深梦境调度器lifespan）
│   └── routes/
│       ├── chat.py               # 聊天（send/stream/history/compact/token-usage/cancel/message-edit-delete + memory_debug + Think事件 + response_style）
│       ├── session.py            # 会话（new/load/list/delete/reset）
│       ├── character.py          # 角色（list/get/switch/create/update/delete/upload-avatar + thinking 思考链配置）
│       ├── persona.py            # Persona（list/get/active/create/update/delete/switch）
│       ├── authors_note.py       # Author's Note（get/save/delete，每会话独立）
│       ├── worldbook.py          # 世界书（list/get/create/update/delete，文件存储）
│       └── skills.py             # Skills（list/get/create/update/delete/upload/invoke，Markdown 目录存储）
│       ├── knowledge.py          # 知识库（list/get/upload/create/search/delete + scan/bases/graph sync，文件切分+向量化+语义搜索）
│       ├── tdb.py                # TDB 通用浏览（条目 CRUD + 文件树 + 从磁盘导入 + 去重 + 编辑同步源文件）
│       ├── graph.py              # 图谱 CRUD + 重抽 API（实体/边/邻居/重抽，通用支持任意 TDB）
│       ├── avatar.py             # 头像管理（upload/list/delete，文件存储到 characters/avatars/）
│       ├── models.py             # 模型（list，从 LiteLLM 代理获取可用模型）
│       ├── config.py             # 配置（list/read/update）+ TDB 列表 + 图谱提示词编辑 API
│       └── ws.py                 # WebSocket 推送端点（/ws/push）
│       └── system.py             # T22 系统管理（手动触发反思 + 反思状态 + 手动触发梦境 + 梦境状态）
│
├── lumen-Front/                  # 前端（Tauri 2 桌面应用）
│   ├── tailwind.config.js        # Tailwind 配置（覆盖 slate/amber 色阶为暖灰色调）
│   └── src/
│       ├── App.tsx               # 应用入口（MainLayout 持有跨模式资源 + ModeContainer 替代旧 ChatInterface）
│       ├── stores/               # Zustand 全局状态
│       │   └── useModeStore.ts   # 模式状态（activeMode + mounted 懒加载追踪）
│       ├── modes/                # T11 Phase D 三模式容器
│       │   ├── ModeContainer.tsx # 懒挂载 + display:none 容器（读 useModeStore）
│       │   ├── ChatMode.tsx      # 聊天模式 UI 编排（纯渲染，逻辑在 useChatMode）
│       │   ├── BaseMode.tsx      # 基地模式骨架（占位）
│       │   └── WritingMode.tsx   # 写作模式骨架（占位）
│       ├── api/                  # HTTP 客户端（chat, session, character, config, ws, persona, authorNote, worldbook, avatar, models, skills, knowledge, graph, tdb）
│       ├── commands/             # 斜杠命令（registry 注册中心 + builtin 内置命令）
│       ├── hooks/                # 状态管理（useChat, useChatMode[聊天逻辑层], useDebugState, useSessions, useCharacters, useConfig, usePush, usePersona, useAuthorNote, useWorldBook, useSkills, useRPG, useResizableWidth[可拖拽宽度]）
│       ├── components/           # UI 组件（ChatPanel, ActivityBar, SidePanel, Popover, MarkdownContent, CommandPalette, MemoryWindow, GraphWindow, GraphEditor, RpgPanel[RPG房间状态面板], FloatingLayerHost, TdbFileTree[共享文件树], ResizablePanel[可拖拽面板], panels/[CharacterPanel 思考链UI]）
│       ├── pages/                # 页面组件（WorldBookList, WorldBookEditor, SkillList, SkillEditor, AvatarManager, ConfigList, ConfigEditor, DebugWindowPage[独立监控窗口+localStorage持久化], ToolTipsPage, ThinkingClustersPage）
│       ├── types/                # 类型定义（session, character+ThinkingConfig, persona, authorNote, worldbook, avatar, config, push, skills, knowledge）
│       └── styles/               # 样式（index.css 含 CSS 变量, App.css, markdown.css, editor.css 暖灰富文本主题）
│
├── tests/                        # 测试
├── scripts/                      # 一次性脚本
│   └── migrate_knowledge.py      # T23 迁移：data/knowledge/ → data/知识库/
├── requirements.txt              # Python依赖
└── .env                          # 环境配置（API_URL, API_KEY, MODEL）
```

---

## 核心依赖链（T24 Agent 组件化 + T25 RPG）

```
api/routes/chat.py ──→ lumen/agent_chat.py（Agent 入口）
                          ├── agent.py（Agent 容器：组件排序 → pre_act → decide + mailbox[AgentMessage]）
                          ├── components/
                          │   ├── identity.py      → prompt/persona.py, prompt/character.py
                          │   ├── lore.py          → prompt/worldbook_matcher.py, services/knowledge/
                          │   ├── memory.py         → services/memory/
                          │   ├── skills.py         → prompt/skill_store.py
                          │   ├── thinking_cluster.py → services/thinking_clusters.py, services/embedding.py
                          │   ├── tool.py           → prompt/tool_prompt.py
                          │   └── react_acting.py   → services/llm.py, tool.py, tools/parse.py
                          │                          services/context/, services/history.py
                          ├── core/session.py（会话状态 + reload_system_prompt）
                          ├── core/message_bus.py（T25 消息总线 + 全局单例）
                          └── config.py（模型配置 + 每服务嵌入配置）

T25 RPG 链路：
core/environments/gm.py（GMEnvironment 4步裁决链）
    ├── core/message_bus.py（send_to / broadcast / rooms）
    ├── services/world_state.py（SQLite 状态黑板）
    ├── tools/dice.py（掷骰，零依赖）
    └── tools/rpg.py（move_to/roll_check/resolve_attack）
          ├── services/world_state.py（状态读写）
          └── core/message_bus.py（房间订阅联动）

旧路径（保留兼容）：
api/routes/chat.py ──→ lumen/query.py::chat_non_stream()（非流式，仍用旧注入）
                          └── prompt/builder.py（session 初始化 system prompt）
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
| `GET` | `/knowledge/scan` | 扫描知识库变更+新知识库发现（T23） |
| `POST` | `/knowledge/scan/apply` | 确认处理扫描变更（T23） |
| `GET` | `/knowledge/bases` | 知识库列表（T23） |
| `POST` | `/knowledge/bases` | 新建知识库（T23） |
| `DELETE` | `/knowledge/bases/{name}` | 删除知识库（T23） |
| `POST` | `/knowledge/graph/sync` | 同步脏文件图谱（T23） |
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
| `POST` | `/graph/{tdb}/re-extract` | 图谱重抽（按文件或全量） |
| `GET` | `/config/graph-prompt` | 读取图谱抽取提示词 |
| `PUT` | `/config/graph-prompt` | 更新图谱抽取提示词 |
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
| `POST` | `/api/system/force_reflect` | 手动触发反思（扫描最近N小时日记送入反思管道） |
| `GET` | `/api/system/reflection_status` | 查看最近一次反思运行状态 |
| `POST` | `/api/system/trigger_dream` | 手动触发深梦境（涟漪召回→梦境叙事→热反思管道） |
| `GET` | `/api/system/dream_status` | 查看深梦境调度器状态 |
