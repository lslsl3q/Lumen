# Lumen 代码结构索引

> **用途**：这是 Lumen 项目的代码地图。新会话开始时先读这个文件，了解项目组织结构，然后按需读取具体代码。

**最后更新**：2026-04-14 16:30

---

## 📁 目录结构概览

```
Lumen/
├── lumen/                   # 🔵 核心代码包（必需、高耦合）
│   ├── __init__.py          # 包导出定义
│   ├── config.py            # 配置管理（API客户端、模型选择）
│   ├── llm.py               # LLM适配器层（统一调用接口）
│   ├── chat.py              # 对话核心逻辑
│   ├── prompt.py            # 提示词构建（角色卡片→系统提示词）
│   ├── tools.py             # 工具调用系统（解析、执行、返回值统一）
│   ├── message_types.py     # 消息类型和元数据定义（支持上下文折叠）
│   ├── context.py           # 上下文管理（消息裁剪、折叠接口）
│   ├── history.py           # 对话历史存储（SQLite、支持元数据）
│   └── memory.py            # 记忆系统（会话摘要）
│
├── lumen-Front/             # 🟢 前端项目（Tauri 2桌面应用）
│   ├── src/                 # React TypeScript源代码
│   │   ├── ChatInterface.tsx    # 聊天界面组件
│   │   ├── api/               # API客户端（连接FastAPI后端）
│   │   │   └── chat.ts        # 聊天API接口
│   │   ├── hooks/             # React Hooks
│   │   │   └── useChat.ts     # 聊天状态管理
│   │   ├── App.tsx            # 应用入口
│   │   └── main.tsx           # React入口
│   ├── src-tauri/           # Rust后端（Tauri 2）
│   │   ├── Cargo.toml        # Rust依赖配置
│   │   ├── src/              # Rust源代码
│   │   ├── tauri.conf.json   # Tauri配置
│   │   └── icons/            # 应用图标
│   ├── package.json         # Node.js依赖
│   ├── vite.config.ts       # Vite构建配置
│   ├── tailwind.config.js   # Tailwind CSS配置
│   └── tsconfig.json        # TypeScript配置
│
├── api/                     # 🟢 FastAPI后端接口
│   └── routes/
│       ├── chat.py          # 聊天API端点
│       └── session.py       # 会话管理API端点
│
├── tool_lib/                # 🟢 工具定义库
│   ├── registry.py          # 工具注册系统（CRUD、验证）
│   └── registry.json        # 工具定义存储
│
├── characters/              # 🟢 角色/Agent配置
│   ├── default.json         # 默认角色（助手）
│   └── xiaoming.json        # 小明角色
│
├── data/                    # 🟢 运行时数据
│   └── history.db           # SQLite数据库（对话历史、摘要）
│
├── tests/                   # 🟢 测试代码
│   └── test_context.py      # context模块测试
│
├── requirements.txt         # 依赖清单
├── .env                     # 环境配置（API_URL, API_KEY, MODEL）
├── .gitignore               # Git忽略规则
├── CODE_INDEX.md            # 本文件（代码结构索引）
└── CLAUDE.md                # Claude Code工作指南
```

---

## 🔵 核心模块 (lumen/)

**判断标准**：必需运行 + 高耦合 + 高频使用

| 文件 | 职责 | 依赖 | 关键函数/类 | 使用场景 |
|------|------|------|------------|----------|
| **config.py** | 配置管理 | OpenAI, python-dotenv | `client`, `get_model()` | 所有需要调用LLM的地方 |
| **llm.py** | LLM适配器层 | config | `chat()` | 统一不同厂商的调用格式 |
| **chat.py** | 对话核心 | 所有核心模块 | `chat_stream()`, `load()`, `reset()` | 处理用户对话、工具调用 |
| **prompt.py** | 提示词构建 | 无 | `build_system_prompt()`, `build_messages()` | 角色卡片→系统提示词 |
| **tools.py** | 工具调用 | tool_lib.registry | `execute_tool()`, `execute_tools_parallel()`, `parse_tool_call()`, `ErrorCode` | AI调用工具的解析和执行，支持并行，返回值统一 |
| **message_types.py** | 消息类型定义 | 无 | `MessageType`, `MessageMetadata`, `create_message()`, `fold_tool_calls()` | 定义消息类型和元数据，支持上下文折叠 |
| **context.py** | 上下文管理 | message_types | `trim_messages()`, `fold_tool_calls()`（预留）, `filter_for_ai()` | 控制上下文长度，过滤折叠消息 |
| **history.py** | 历史存储 | sqlite3 | `save_message()`, `load_session()`（支持metadata） | SQLite读写对话历史，支持元数据存储 |
| **memory.py** | 记忆系统 | history, llm | `generate_summary()`, `get_memory_context()` | 会话摘要生成和注入 |

### 调用关系图

```
前端层（Tauri 2 + React）
  ↓ HTTP请求
BFF层（FastAPI）
  ├─→ api/routes/chat.py
  ├─→ api/routes/session.py
  └─→ api/routes/character.py
     ↓
chat.py（对话核心）
  ├─→ config.py（获取模型）
  ├─→ llm.py（调用LLM）
  ├─→ prompt.py（构建提示词）
  ├─→ tools.py（工具调用）
  │     ↓
  │   tool_lib/registry.py
  ├─→ message_types.py（创建带元数据的消息）
  ├─→ context.py（裁剪上下文、过滤折叠消息）
  ├─→ history.py（存储历史和元数据）
  └─→ memory.py（记忆摘要）
```

---

## 🟢 配置和数据（根目录）

**判断标准**：用户可编辑 + 静态配置

| 目录/文件 | 内容 | 用户操作 |
|----------|------|---------|
| **characters/** | 角色/Agent配置（JSON） | 创建/编辑新角色 |
| **tool_lib/** | 工具定义和注册 | 注册新工具 |
| **data/** | 运行时数据（SQLite DB） | 查看/备份 |
| **.env** | 环境变量配置 | 修改API配置 |

### characters/ 角色配置

```json
{
  "name": "角色名",
  "model": "使用的模型（可选，默认用.env的）",
  "system_prompt": "系统提示词",
  "greeting": "开场白",
  "tools": ["工具名列表"]
}
```

### tool_lib/ 工具定义

```json
{
  "工具名": {
    "description": "工具描述",
    "parameters": {
      "type": "object",
      "properties": {
        "参数名": {"type": "类型", "description": "描述"}
      },
      "required": ["必需参数"]
    }
  }
}
```

---

## 🟢 前端模块 (lumen-Front/)

**技术栈**：Tauri 2 + React 18 + TypeScript 5.6 + Tailwind CSS 3.4 + Vite 6

| 文件 | 职责 | 依赖 | 关键函数/组件 | 使用场景 |
|------|------|------|-------------|----------|
| **ChatInterface.tsx** | 聊天界面组件 | useChat, chat.ts | 显示消息、处理输入 | 用户聊天界面 |
| **api/chat.ts** | API客户端 | fetch | `sendMessage()` | 连接FastAPI后端 |
| **hooks/useChat.ts** | 聊天状态管理 | React useState | `sendMessage()`, `messages`, `isLoading` | 管理聊天状态和消息列表 |
| **App.tsx** | 应用入口 | ChatInterface | 渲染主界面 | 应用根组件 |
| **src-tauri/Cargo.toml** | Rust依赖配置 | tauri 2.10 | 定义Rust后端依赖 | Tauri桌面应用后端 |
| **src-tauri/tauri.conf.json** | Tauri配置 | - | 窗口设置、构建配置 | 桌面应用配置 |

### 前端架构

```
┌─────────────────────────────────────────────────────┐
│           前端层：Tauri 2 桌面应用                   │
├─────────────────────────────────────────────────────┤
│  React + TypeScript                                │
│  ┌─────────────────────────────────────────────┐   │
│  │  App.tsx                                      │   │
│  │    ↓                                          │   │
│  │  ChatInterface.tsx (聊天界面)                 │   │
│  │    ↓                                          │   │
│  │  useChat Hook (状态管理)                       │   │
│  │    ↓                                          │   │
│  │  API客户端层                                   │   │
│  │  - api/chat.ts (HTTP请求)                     │   │
│  │  - api/websocket.ts (WebSocket) 🔜            │   │
│  └─────────────────────────────────────────────┘   │
│                      ↓                              │
│  Tauri Bridge (进程间通信)                          │
│                      ↓                              │
│  Rust后端 (src-tauri/) - 系统调用、窗口管理          │
└─────────────────────────────────────────────────────┘
         ↓                              ↓
    HTTP/SSE                        WebSocket 🔜
         ↓                              ↓
┌─────────────────────────────────────────────────────┐
│        BFF层：FastAPI 后端 (localhost:8000)         │
├─────────────────────────────────────────────────────┤
│  API适配层（Backend For Frontend）                  │
│                                                       │
│  ┌─────────────────────────────────────────────┐   │
│  │  HTTP/SSE 接口                               │   │
│  │  - api/routes/chat.py      (聊天API)        │   │
│  │  - api/routes/session.py   (会话管理)       │   │
│  │  适用场景：请求-响应、流式推送               │   │
│  └─────────────────────────────────────────────┘   │
│                                                       │
│  ┌─────────────────────────────────────────────┐   │
│  │  WebSocket 接口 🔜                           │   │
│  │  - api/ws/voice.py          (语音流)         │   │
│  │  - api/ws/screen.py         (屏幕流)         │   │
│  │  - api/ws/control.py        (桌面控制)       │   │
│  │  - api/ws/ui_style.py       (AI控制UI)       │   │
│  │  适用场景：双向实时通信、音视频流            │   │
│  └─────────────────────────────────────────────┘   │
│                                                       │
│  职责：鉴权、限流、协议转换、数据格式化               │
└─────────────────────────────────────────────────────┘
                      ↓ 调用
┌─────────────────────────────────────────────────────┐
│     AI Agent逻辑层：lumen/ 核心代码 (Python)         │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐   │
│  │  chat.py           (对话核心)                │   │
│  │  tools.py          (工具调用系统)            │   │
│  │  context.py        (上下文管理)              │   │
│  │  history.py        (对话历史存储)            │   │
│  │  memory.py         (记忆系统)                │   │
│  │  prompt.py         (提示词构建)              │   │
│  │  llm.py            (LLM适配器层)             │   │
│  │  config.py         (配置管理)                │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                      ↓ 数据访问
┌─────────────────────────────────────────────────────┐
│              数据层：存储和检索                      │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────┐      │
│  │  SQLite        │  │  向量存储 🔜        │      │
│  │  history.db    │  │  vector_store/      │      │
│  └─────────────────┘  └─────────────────────┘      │
│  ┌─────────────────┐  ┌─────────────────────┐      │
│  │  工具注册表     │  │  知识图谱 🔜        │      │
│  │  tool_lib/      │  │  knowledge/         │      │
│  └─────────────────┘  └─────────────────────┘      │
│  ┌─────────────────┐                                  │
│  │  角色配置       │                                  │
│  │  characters/    │                                  │
│  └─────────────────┘                                  │
└─────────────────────────────────────────────────────┘
```

### 通信协议选择

| 功能 | 协议 | 原因 | 状态 |
|------|------|------|------|
| **聊天消息** | HTTP + SSE | 请求-响应模式，流式推送LLM回复 | ✅ 已实现 |
| **会话管理** | HTTP | CRUD操作，一次性请求 | ✅ 已实现 |
| **语音录制** | WebSocket | 双向实时音频流 | 🔜 待开发 |
| **语音转文字** | HTTP | 上传音频文件，返回文字 | 🔜 待开发 |
| **屏幕录制** | WebSocket | 实时视频流传输 | 🔜 待开发 |
| **桌面控制** | WebSocket | 实时双向指令 | 🔜 待开发 |
| **AI控制UI** | SSE | 服务器单向推送样式更新 | 🔜 待开发 |

### 开发环境配置

**启动命令**：
```bash
cd lumen-Front
pnpm tauri dev
```

**端口配置**：
- Vite前端：http://localhost:1420
- FastAPI后端：http://localhost:8000

**环境要求**：
- Node.js (通过pnpm管理依赖)
- Rust/Cargo (Tauri后端)
- Python (FastAPI后端，在父目录)

---

## 🟢 FastAPI后端 (api/)

**技术栈**：FastAPI + Python

**层级定位**：BFF层（Backend For Frontend）

**核心职责**：
- ✅ 协议适配：HTTP → 内部Python调用
- ✅ 数据格式化：JSON → lumen/内部对象
- ✅ 鉴权认证：用户身份验证（待实现）
- ✅ 请求限流：防止API滥用（待实现）
- ✅ 流式推送：SSE支持（待实现）

| 文件 | 职责 | 端点 | 使用场景 |
|------|------|------|----------|
| **routes/chat.py** | 聊天API | POST /chat/send, POST /chat/stream | 处理聊天请求，调用lumen/chat.py |
| **routes/session.py** | 会话管理 | POST /new, POST /load, GET /list, DELETE /delete | 会话CRUD操作，调用lumen/history.py |
| **ws/voice.py** | 语音WebSocket | WS /ws/voice | 实时语音流处理（待开发） |
| **ws/screen.py** | 屏幕WebSocket | WS /ws/screen | 实时屏幕流处理（待开发） |
| **ws/control.py** | 控制WebSocket | WS /ws/control | 实时桌面控制指令（待开发） |
| **ws/ui_style.py** | UI样式WebSocket | WS /ws/ui_style | AI实时控制UI样式（待开发） |

### BFF层调用流程

**HTTP路径（简单请求）：**
```
HTTP请求 (JSON)
  ↓
FastAPI路由 (api/routes/*.py)
  ↓
参数验证 + 数据转换
  ↓
调用 lumen/ 核心逻辑
  ↓
返回结果 + 格式化
  ↓
HTTP响应 (JSON)
```

**SSE路径（流式推送）：**
```
HTTP请求
  ↓
FastAPI路由
  ↓
调用 lumen/ 核心逻辑
  ↓
流式生成数据
  ↓
SSE连接推送
  ↓
前端实时更新
```

**WebSocket路径（实时双向）：** 🔜
```
WebSocket连接建立
  ↓
持久化连接
  ↓
双向实时数据流
  ├─ 前端 → 后端：语音流、屏幕流
  └─ 后端 → 前端：转写结果、控制指令
  ↓
连接关闭
```

### WebSocket连接管理

**连接建立流程：**
```
1. 前端启动 → 创建WebSocket连接
2. 握手认证（Token验证）
3. 连接建立成功
4. 心跳检测（保持连接）
5. 异常重连机制
```

**消息格式：**
```json
{
  "type": "voice_data" | "screen_data" | "control_cmd" | "ui_style",
  "payload": { ... },
  "timestamp": 1234567890
}
```

---

## 🟡 未来独立模块

**判断标准**：可选 + 低耦合 + 复杂逻辑

| 模块 | 优先级 | 状态 | 说明 |
|------|--------|------|------|
| **Agent系统** | 高 | 🔜 待开发 | lumen/agent.py，多Agent协作 |
| **向量检索** | 高 | 🔜 待开发 | vector_store/，语义搜索 |
| **知识图谱** | 中 | 🔜 待开发 | knowledge/，记忆宫殿 |
| **情感引擎** | 中 | 🔜 待开发 | emotion/，情绪分析 |

---

## 📊 数据流

### 典型对话流程（三层架构）

```
【前端层】
1. 用户输入 → ChatInterface.tsx
2. useChat Hook 管理状态
3. api/chat.ts 发送HTTP请求

【BFF层】
4. FastAPI接收请求 (api/routes/chat.py)
5. 参数验证 + 数据格式化
6. 调用 lumen.chat.chat_stream()

【AI逻辑层】
7. chat.py:
   ├─ 构建消息: prompt.build_messages()
   ├─ 裁剪上下文: context.trim_messages()
   ├─ 获取模型: config.get_model()
   ├─ 调用LLM: llm.chat()
   ├─ 检测工具调用: tools.parse_tool_call()
   │   ├─ 验证: validate_tool_call()
   │   ├─ 执行: tools.execute_tool()
   │   └─ 重试LLM: llm.chat()
   ├─ 保存历史: history.save_message()
   └─ 返回结果

【BFF层】
8. FastAPI接收结果
9. 格式化为JSON响应

【前端层】
10. React接收响应
11. 更新UI显示
```

### 工具调用流程

```
AI回复 → 解析工具调用 → tools.parse_tool_call()
                ↓
        返回格式：{"mode": "single" | "parallel", ...}
                ↓
    ┌───────────┴───────────┐
    ↓                       ↓
单个工具                  多个工具并行
validate_tool_call()      验证所有工具
    ↓                       ↓
execute_tool()        execute_tools_parallel()
    ↓                       ↓
返回标准格式：           返回标准格式列表：
{                        [
  "success": bool,         {success, tool, data, ...},
  "tool": str,             ...
  "data": any,           ]
  "error_code": str,
  ...
]
    ↓                       ↓
创建带元数据的消息      创建带元数据的消息
message_types.create...   message_types.create...
    ↓                       ↓
保存到 history（支持metadata）
    ↓
重新调用LLM（带完整的工具结果 JSON）
```

---

## 🔧 常见操作定位

| 想要... | 去哪里... |
|---------|----------|
| **换模型/厂商** | `.env`（修改MODEL）+ `config.py`（如果需特殊处理）|
| **添加新工具** | `tool_lib/registry.json`（定义）+ `characters/*.json`（启用）|
| **创建新角色** | `characters/`（新建JSON文件）|
| **修改对话逻辑** | `lumen/chat.py` |
| **修改记忆策略** | `lumen/memory.py` |
| **修改上下文长度** | `lumen/context.py` |
| **查看历史记录** | `data/history.db`（用SQLite工具）|
| **修改桌面界面** | `lumen-Front/src/ChatInterface.tsx` |
| **修改前端API** | `lumen-Front/src/api/chat.ts` |
| **修改后端API** | `api/routes/chat.py` |
| **了解消息类型** | `lumen/message_types.py` |
| **启动桌面应用** | `cd lumen-Front && pnpm tauri dev` |
| **启动后端服务** | 双击 `启动后端.bat` (Windows) 或运行 `启动.sh` (Linux/Mac) |

---

## 📦 上下文折叠机制（已预留接口）

### 设计原理

工具调用会产生中间消息（AI 输出的 JSON + 返回结果），这些消息在 AI 已处理后可以折叠。

### 消息生命周期

```
第 N 轮（工具调用）：
1. user: "2+2等于几？"
2. assistant: {"tool": "calculate", ...}           ← tool_call
3. user: {"success": true, "data": "2+2=4", ...}   ← tool_result
4. assistant: "2+2等于4"                            ← AI 已输出结果

第 N+1 轮（调用 fold_tool_calls）：
- 检测 2-3 是工具调用对
- 检测 4 存在（AI 已处理）
- 标记消息 3 为 folded=True

发送给 AI 时（调用 filter_for_ai）：
- folded=True 的消息不发送
- 但保留在数据库，前端可展开查看
```

### 实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| **消息元数据** | ✅ 完成 | history.py 支持 metadata 存储 |
| **折叠接口** | ✅ 预留 | context.py 中 fold_tool_calls() |
| **过滤接口** | ✅ 完成 | context.py 中 filter_for_ai() |
| **具体折叠逻辑** | 🔜 待实现 | 等 5+ 工具时再实现 |

---

## 🎯 设计原则

详见 [memory/code_design_principles.md](memory/code_design_principles.md)

1. **单一职责** - 一个文件只做一件事
2. **低耦合** - 模块间通过接口隔离
3. **配置与代码分离** - 配置放 .env 和 JSON
4. **预留扩展点** - llm.py 可加新厂商适配器

---

## 📝 更新日志

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-04-14 16:30 | 新增 lumen-Front/ | 新增Tauri 2桌面应用前端 |
| 2026-04-14 16:30 | 新增 api/routes/ | FastAPI后端API接口 |
| 2026-04-13 21:30 | 新增 message_types.py | 支持消息类型和元数据，为上下文折叠打基础 |
| 2026-04-13 21:30 | 更新 tools.py | 返回值统一格式化，支持并行工具调用 |
| 2026-04-13 21:30 | 更新 context.py | 预留 fold_tool_calls() 和 filter_for_ai() 接口 |
| 2026-04-13 21:30 | 更新 history.py | 支持元数据存储，数据库迁移 |
| 2026-04-13 | 创建初始索引 | 项目结构化 |
| 2026-04-13 | 新增 config.py, llm.py | 重构配置管理 |

---

**维护规则**：见 [memory/code_index_rules.md](memory/code_index_rules.md)
- 增删文件时必须更新
- 职责变化时必须更新
- 新会话启动时优先读取
