# Lumen 代码结构索引

> **用途**：这是 Lumen 项目的代码地图。新会话开始时先读这个文件，了解项目组织结构，然后按需读取具体代码。

**最后更新**：2026-04-13 21:30

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
├── main.py                  # 网页界面入口（Gradio）
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
main.py (界面)
  ↓
chat.py (对话核心)
  ├─→ config.py (获取模型)
  ├─→ llm.py (调用LLM)
  ├─→ prompt.py (构建提示词)
  ├─→ tools.py (工具调用)
  │     ↓
  │   tool_lib/registry.py
  ├─→ message_types.py (创建带元数据的消息)
  ├─→ context.py (裁剪上下文、过滤折叠消息)
  ├─→ history.py (存储历史和元数据)
  └─→ memory.py (记忆摘要)
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

### 典型对话流程

```
1. 用户输入 → main.py (Gradio界面)
2. main.py → chat.chat_stream(用户输入)
3. chat.py:
   ├─ 构建消息: prompt.build_messages()
   ├─ 裁剪上下文: context.trim_messages()
   ├─ 获取模型: config.get_model()
   ├─ 调用LLM: llm.chat()
   ├─ 检测工具调用: tools.parse_tool_call()
   │   ├─ 验证: validate_tool_call()
   │   ├─ 执行: tools.execute_tool()
   │   └─ 重试LLM: llm.chat()
   ├─ 保存历史: history.save_message()
   └─ 返回结果 → main.py → 用户
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
| **修改界面** | `main.py` |
| **了解消息类型** | `lumen/message_types.py` |

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
