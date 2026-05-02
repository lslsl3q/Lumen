# T22 反思提炼系统 — 模块说明书

> 最后更新：2026-04-30（Step 3 完成）

---

## 一句话解释

**反思系统是 Lumen 的"潜意识"**——AI 保存日记后，后台自动从中提炼结构化知识卡片，分类存到图谱和向量库。不需要用户手动整理，Lumen 自己"想"。

---

## 用比喻理解

想象你每天都在写日记。你的大脑不会只把日记本锁进抽屉——它会在你睡觉时自动：
- 从日记里提取**重要事实**（"小明是工程师"）→ 存进长期记忆
- 注意到**关系变化**（"我对小明的态度从怀疑变成信任"）→ 更新社交图谱
- 发现**规律模式**（"每次下雨我都心情不好"）→ 存为自我认知
- 标记**未完成的事**（"下周要交报告"）→ 放进待办线索

这就是反思系统做的事。只是"你"换成了 AI 角色。

---

## 数据流（一张图看懂）

```
日记保存 (daily_note.py)
    │
    ▼
反思事件 (ReflectionEvent) ──→ asyncio.Queue（排队）
    │
    ▼
后台消费者 (_reflection_consumer) 逐个取出
    │
    ├─ Step 1: SimHash 计算（纯代码，毫秒级）
    │     └─ 检测情绪词 → Trigger 1 判定（有情绪？继续；没情绪？跳过）
    │
    ├─ Step 2: 检索 Top-3 历史卡片（语义相似搜索）
    │
    ├─ Step 3: 调 LLM，一次性完成三件事：
    │     ├─ 五维分类（这张日记属于哪种知识？）
    │     ├─ 矛盾检测（跟历史卡片打架吗？）
    │     └─ 未知实体标注（提到了谁？AI 认识吗？）
    │
    └─ Step 4: 存储路由
          ├─ entity_fact     → 图谱节点（谁是谁）
          ├─ relation_assess → 图谱边（谁跟谁什么关系）
          ├─ core_rule       → knowledge.tdb（世界观规则）
          ├─ behavior_pattern → knowledge.tdb（行为习惯）
          └─ clue_plan       → knowledge.tdb（线索/计划，将来迁到 threads.tdb）
```

---

## 文件清单（9 个文件）

### 新增文件（7 个）

| 文件 | 行数 | 角色 | 一句话 |
|------|------|------|--------|
| `lumen/services/simhash.py` | ~135 | 情感检测器 | 对中文文本算 64 位指纹，检测 8 种情绪（愤怒/恐惧/悲伤/喜悦/惊讶/厌恶/信任/期待） |
| `lumen/events/schema.py` | ~40 | 事件定义 | 定义 ReflectionEvent 结构——所有数据源（聊天/日记/工具结果）送入管道前的统一包装 |
| `lumen/events/bus.py` | ~63 | 事件总线 | 极简 pub/sub，同步/异步 handler 都能注册（目前反思管道直接用队列，bus 留给未来扩展） |
| `lumen/events/__init__.py` | ~18 | 包导出 | 导出核心符号，方便外部 import |
| `lumen/types/reflection.py` | ~83 | 输出类型 | 定义 ReflectionCard（知识卡片）、ReflectionOutput（LLM 输出的 JSON 结构）、ReflectionPipelineResult（运行结果） |
| `lumen/core/reflection.py` | ~378 | 管道大脑 | 核心编排器：队列管理 + 三步触发 + LLM 调用 + 存储路由 |
| `api/routes/system.py` | ~112 | 管理 API | `POST /api/system/force_reflect`（手动触发反思）+ `GET /api/system/reflection_status`（查看状态） |

### 修改文件（2 个）

| 文件 | 改了什么 |
|------|---------|
| `lumen/tools/daily_note.py` | `_async_store()` 末尾加了 ~15 行：日记保存后自动扔进反思队列 |
| `api/main.py` | 注册 system 路由 + lifespan 中启动/停止反思消费者 |

---

## 核心概念速查

### SimHash（情感指纹）

- **是什么**：把一段文本压缩成一个 64 位数字（指纹）
- **为什么不用 LLM**：纯 Python 计算，毫秒级，O(1)。先过滤掉平淡无奇的日记，值得反思的才调 LLM
- **情绪位元**：64 位中的 bits [48-55] 对应 8 种基本情绪。只有命中了情绪词表（中英双语），对应位才会亮
- **门控逻辑**：`has_strong_emotion() == False` → 跳过，不浪费 LLM 调用

### 五维分类

| 维度 | 回答的问题 | 存到哪 | 例子 |
|------|-----------|--------|------|
| `entity_fact` | "是什么" | 图谱节点 | "柳如烟是青云宗内门弟子" |
| `relation_assess` | "怎么样" | 图谱边 | "陈明信任柳如烟" |
| `core_rule` | "为什么/怎么做" | knowledge.tdb | "灵力分五行，相生相克" |
| `behavior_pattern` | "规律是什么" | knowledge.tdb | "用户遇 bug 先跑 profiler" |
| `clue_plan` | "还没做什么" | knowledge.tdb（暂） | "柳如烟的哥哥失踪，可能是暗线" |

### 三种触发器

| 触发器 | 谁执行 | 干什么 | 耗时 |
|--------|--------|--------|------|
| Trigger 1 | SimHash（纯代码） | 情感门控：有情绪词的日记才往下走 | <1ms |
| Trigger 2 | LLM | 矛盾检测：新日记跟历史卡片逻辑冲突吗？冲突就标记 `needs_resolution` | 1-3s |
| Trigger 3 | LLM | 未知实体：日记提到但 AI 不认识的人/物/地名 | 同上（合并调用） |

### 卡片状态

| 状态 | 含义 | RAG 检索可见？ |
|------|------|---------------|
| `active` | 正常可用 | 是 |
| `needs_resolution` | 检测到矛盾，待人工裁决 | 否（隔离） |
| `draft` | 低置信度，待确认 | 否 |

---

## 关键设计决策（为什么这么做）

1. **asyncio.Queue + 消费者，不用 ThreadPoolExecutor**：线程池在 FastAPI 重启时是游离线程——写到一半的 TriviumDB 会损坏。消费者模式绑定 lifespan，优雅退出时 `join()` 等队列清空再关。

2. **LLM 输出强制数组 `{"cards": [...]}` 而非单对象**：一篇日记可能同时包含事实+关系+规律。单对象会让 LLM 强行缝合，丢失信息。

3. **SimHash 用 `asyncio.to_thread()` 包装**：jieba 分词是 CPU 密集型同步操作，不扔线程池会卡死 FastAPI 事件循环。

4. **矛盾检测靠 LLM 而非向量相似度**：向量空间中"陈明喜欢喝水"和"陈明不喜欢喝水"高度重合，纯代码分不出来。把 Top-3 历史卡片当 context 喂给 LLM，让它自己判断逻辑矛盾。

5. **反思 Prompt 内联在代码里（MVP 阶段）**：五维分类 Prompt 还需要实测调优。稳定后再抽成热编辑文件（跟 graph_extract 一样迭代路径）。

---

## 如何扩展

### 新增触发源

目前只有 `daily_note.py` 会触发反思。要让聊天消息也触发：

1. 在聊天保存处创建 `ReflectionEvent(source_type=SourceType.CHAT_MESSAGE, ...)`
2. 调用 `enqueue_reflection(event)`

### 调优反思 Prompt

修改 `lumen/core/reflection.py` 中的 `_REFLECTION_SYSTEM_PROMPT` 和 `_REFLECTION_USER_TEMPLATE`。稳定后抽到 `lumen/prompt/reflection_prompt.py` 或 `lumen/data/reflection/`。

### 新增第六维度

1. 在 `lumen/types/reflection.py` 的 `ReflectionDimension` 加新枚举值
2. 在 `lumen/core/reflection.py` 的 `_REFLECTION_SYSTEM_PROMPT` 表格中加一行
3. 在 `_route_card_to_store()` 加新 target 的处理分支

### threads.tdb 独立建库

当前 `clue_plan` 暂存在 knowledge.tdb。后续建独立的 threads.tdb 后，修改 `_route_card_to_store()` 中的 `THREADS_TDB` 分支即可。

### 查看运行状态

```bash
curl http://localhost:8888/api/system/reflection_status
```

返回最近一次反思的完整结果（触发器状态、产出的卡片数、耗时等）。

### 手动触发批量反思

```bash
curl -X POST http://localhost:8888/api/system/force_reflect \
  -H "Content-Type: application/json" \
  -d '{"character_id": "", "lookback_hours": 24}'
```

---

## 依赖关系

```
api/routes/system.py
       ↓
lumen/core/reflection.py  ←── lumen/tools/daily_note.py
       ↓                           ↓
       ├── lumen/services/simhash.py
       ├── lumen/services/embedding.py
       ├── lumen/services/knowledge.py
       ├── lumen/events/schema.py
       ├── lumen/events/bus.py
       └── lumen/types/reflection.py
```

单向依赖：api → core → {services, events, types}，不反向。

---

## 相关文档

- [反思提炼系统设计](../memory/project_reflection_system.md) — 完整设计文档
- [项目路线图](../memory/roadmap.md) — T22 任务状态
- [CLAUDE.md](../../CLAUDE.md) — 项目工作指南
