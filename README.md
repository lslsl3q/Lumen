# Lumen

AI 桌面角色扮演应用，支持多模型、多角色、知识库、记忆系统和 RPG 跑团。

## 架构

```
后端: Python 3.11 + FastAPI（全异步 AsyncOpenAI）
前端: Tauri 2 + React + TypeScript + Tailwind v4
通信: SSE 流式 + WebSocket 推送
存储: SQLite + TriviumDB（向量/图谱）
```

## 核心特性

- **组件化 Agent**：可插拔组件架构，按优先级分层拼装 System Prompt
- **动静分离**：静态区（角色/工具）缓存命中，动态区（记忆/世界书）每轮重建
- **ReAct 工具调用**：LLM 自主决策调用工具（搜索、计算、文件管理、掷骰等）
- **知识库系统**：文件导入 → 自动切分 → 向量化 → 语义检索，支持占位符注入
- **记忆系统**：跨会话向量记忆 + SimHash 去重 + PRF 查询精炼
- **图谱系统**：TriviumDB 图谱（实体/关系抽取 + 邻居召回 + Leiden 社区发现）
- **反思与梦境**：五维情感分类反思管道 + 深梦境涟漪召回 + 定时调度
- **RPG 跑团**：GM 裁决链 + WorldState 状态黑板 + 掷骰/移动/攻击工具
- **思维簇**：MetaThinking 管道，链式推理模块按场景动态注入

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+ & pnpm
- Rust（Tauri 编译）
- TriviumDB 本地编译（maturin）

### 后端

```bash
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt

# 编译 TriviumDB
cd vendor/TriviumDB
maturin develop --release
cd ../..

# 配置 .env
cp .env.example .env         # 填入 API_URL / API_KEY / MODEL

# 启动
python -m uvicorn api.main:app --host 127.0.0.1 --port 8888
```

### 前端

```bash
cd lumen-Front
pnpm install
pnpm tauri dev
```

## 项目结构

```
lumen/
├── agent.py              Agent 容器（组件列表 + 信箱 + 决策循环）
├── agent_chat.py         Agent 入口（SSE 流式输出）
├── components/           可插拔组件（Identity/Lore/Memory/Skills/Tool/ThinkingCluster）
├── core/                 大脑（会话/反思/梦境/RPG 环境）
├── tools/                AI 工具（搜索/计算/文件/日记/掷骰/RPG）
├── services/             基础设施（LLM/嵌入/记忆/向量/知识库/图谱）
├── prompt/               提示词构建（角色/世界书/Author's Note/Skills）
├── types/                类型定义
├── api/routes/           HTTP API 端点
└── data/                 运行时数据

lumen-Front/              Tauri 桌面应用前端
vendor/TriviumDB/         TriviumDB 向量/图数据库（Rust + PyO3）
```

## 配置

在项目根目录 `.env` 中配置：

```env
API_URL=http://127.0.0.1:4000/v1    # LLM 代理地址
API_KEY=your-api-key                  # API 密钥
MODEL=deepseek-chat                   # 默认模型
```

## License

Private project.
