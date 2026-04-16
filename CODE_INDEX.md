# Lumen 代码结构索引

> **用途**：新会话读此文件了解项目文件布局和模块依赖。
> **维护**：增删文件或改变职责时更新。规则见 CLAUDE.md 工作流程第 2 条。

**最后更新**：2026-04-16

---

## 目录结构

```
Lumen/
├── lumen/                        # 核心代码包（按角色分层）
│   ├── config.py                 # 全局配置（AsyncOpenAI客户端、模型选择）
│   ├── characters/               # 角色数据（JSON）
│   ├── data/                     # 运行时数据（history.db）
│   │
│   ├── core/                     # 大脑 — 决策循环、会话状态
│   │   ├── chat.py               # ReAct 循环（异步生成器，SSE流式输出）
│   │   └── session.py            # 会话生命周期（内存+DB双查）
│   │
│   ├── tools/                    # 双手 — 每个工具一个 .py
│   │   ├── base.py               # 执行引擎、结果格式化、提示词生成
│   │   ├── parse.py              # AI输出 → 工具调用 解析
│   │   ├── registry.py           # 工具注册中心（CRUD、验证）
│   │   ├── registry.json         # 工具定义数据
│   │   ├── calculate.py          # 计算器
│   │   ├── web_search.py         # 网页搜索（→ services/search.py）
│   │   └── web_fetch.py          # 网页抓取（→ services/fetch.py）
│   │
│   ├── services/                 # 神经 — 基础设施
│   │   ├── context/              # 上下文管理（折叠、裁剪、过滤）
│   │   ├── llm.py                # LLM适配器（AsyncOpenAI）
│   │   ├── search.py             # 搜索服务（DuckDuckGo）
│   │   ├── fetch.py              # 网页抓取服务（httpx异步）
│   │   ├── history.py            # SQLite持久化（会话、消息、摘要）
│   │   ├── memory.py             # 记忆系统（异步摘要、记忆注入）
│   │   ├── vector_store.py       # 【预留】向量存储
│   │   ├── knowledge.py          # 【预留】知识图谱
│   │   └── emotion.py            # 【预留】情感引擎
│   │
│   ├── prompt/                   # 嘴巴 — 提示词构建
│   │   ├── builder.py            # 系统提示词拼接（角色+工具+动态注入）
│   │   ├── character.py          # 角色卡片加载
│   │   └── template.py           # 模板变量系统（{{xxx}} 替换）
│   │
│   └── types/                    # 词汇 — 类型定义
│       ├── messages.py           # 消息类型（TypedDict）+ 工厂函数
│       ├── events.py             # SSE 事件类型
│       └── tools.py              # 工具协议类型（Pydantic）
│
├── api/                          # FastAPI HTTP接口
│   ├── main.py                   # 应用入口、CORS、路由注册
│   └── routes/
│       ├── chat.py               # 聊天（send/stream/history）
│       ├── session.py            # 会话（new/load/list/delete/reset）
│       ├── character.py          # 角色（list/get/switch）
│       └── config.py             # 配置（list/read/update）
│
├── lumen-Front/                  # 前端（Tauri 2 桌面应用）
│   └── src/
│       ├── App.tsx               # 应用入口
│       ├── api/                  # HTTP 客户端（chat.ts, session.ts）
│       ├── hooks/                # 状态管理（useChat.ts, useSessions.ts）
│       ├── components/           # UI 组件（ChatInterface, Sidebar, Panel, MarkdownContent）
│       ├── types/                # 类型定义（session.ts）
│       └── styles/               # 样式（App.css, markdown.css）
│
├── tests/                        # 测试
├── requirements.txt              # Python依赖
└── .env                          # 环境配置（API_URL, API_KEY, MODEL）
```

---

## 核心依赖链

```
api/routes/chat.py ──→ lumen/core/chat.py（ReAct 主循环）
                          ├── core/session.py（会话状态）
                          ├── services/context/（折叠+裁剪）
                          ├── services/llm.py（LLM调用）
                          ├── services/history.py（持久化）
                          ├── services/memory.py（记忆注入）
                          ├── tools/base.py（工具执行）
                          ├── tools/parse.py（工具解析）
                          ├── tools/registry.py（工具验证）
                          ├── prompt/builder.py（提示词拼接）
                          └── config.py（模型配置）
```

---

## API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/chat/send` | 发消息（非流式） |
| `POST` | `/chat/stream` | 发消息（SSE流式） |
| `GET` | `/chat/history` | 聊天历史 |
| `POST` | `/sessions/new` | 创建会话 |
| `POST` | `/sessions/load` | 加载会话 |
| `GET` | `/sessions/list` | 会话列表 |
| `DELETE` | `/sessions/{id}` | 删除会话 |
| `POST` | `/sessions/reset` | 重置会话 |
| `GET` | `/characters/list` | 角色列表 |
| `GET` | `/characters/{id}` | 角色详情 |
| `POST` | `/characters/switch` | 切换角色 |
| `GET` | `/config/list` | 配置项列表 |
| `GET` | `/config/{resource}` | 读取配置 |
| `POST` | `/config/{resource}` | 更新配置 |
