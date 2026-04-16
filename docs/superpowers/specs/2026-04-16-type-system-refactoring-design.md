# Lumen 类型系统重构设计

> 日期：2026-04-16
> 状态：已批准，待实施

---

## 1. 背景

Lumen 项目当前有 17 个文件使用 `Dict[str, Any]` 或裸 `dict` 作为数据类型，零 TypedDict，零运行时校验（API 层除外）。8 种核心数据结构（Message、Metadata、ToolResult、SSE Event、ToolCall、CharacterCard、DynamicContext、SearchResult）全靠隐式约定传递，拼写错误或字段缺失只会在运行时暴露。

本次重构目标：为所有核心数据结构建立显式类型定义，在系统边界用 Pydantic 拦截校验，在内部用 TypedDict 做 IDE 提示。

---

## 2. 设计原则

### 2.1 边界 Pydantic + 内部 TypedDict

| 数据来源 | 校验工具 | 理由 |
|---------|---------|------|
| LLM 输出解析 | Pydantic | 外部数据，不可信 |
| 数据库读取 | Pydantic | 持久化数据，可能损坏 |
| HTTP 请求/响应 | Pydantic | 外部输入 |
| JSON 配置文件 | Pydantic | 外部数据 |
| 工具结果（协议） | Pydantic | 统一协议，强制标准格式 |
| 模块间消息传递 | TypedDict | 内部数据，已校验，零开销 |
| SSE 事件构造 | TypedDict | 内部临时数据，零开销 |

### 2.2 类型文件组织

参考 Claude Code 的两层类型策略：

- **全局共享类型**（跨 3+ 模块）→ `lumen/types/`，按领域拆文件
- **模块专用类型**（1-2 个模块用）→ 就近放 `模块/types.py`
- 类型文件只放类型定义和紧耦合的构造/判断函数，不放业务逻辑
- 模块拆分/合并/新增时，照此规则分配类型归属

---

## 3. 文件结构

```
lumen/types/                        # 全局共享类型（跨模块）
  __init__.py                       # 统一 re-export
  messages.py                       # Message, MessageMetadata（TypedDict）+ 工厂/判断函数
  events.py                         # SSE 事件类型（TypedDict）
  tools.py                          # ToolResult, ParsedToolCall（Pydantic）

lumen/core/
  types.py                          # core 专用类型（预留）

lumen/tools/
  types.py                          # ErrorCode, ToolDefinition

lumen/services/
  types.py                          # SearchResult, SessionInfo

lumen/prompt/
  types.py                          # CharacterCard（Pydantic）, DynamicContext（TypedDict）
```

---

## 4. 类型定义详情

### 4.1 lumen/types/messages.py（TypedDict）

保留现有常量类和工厂函数，将 MessageMetadata 从手写 class 改为 TypedDict：

```python
from typing import TypedDict, Optional, List, Dict, Any

class MessageType:
    NORMAL = "normal"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOOL_RESULT_PARALLEL = "tool_result_parallel"

class FoldReason:
    AI_PROCESSED = "ai_processed"
    OLD_TOKEN_LIMIT = "old_token_limit"
    USER_REQUEST = "user_request"

class MessageMetadata(TypedDict, total=False):
    type: str
    folded: bool
    tool_name: str
    tool_count: int

class Message(TypedDict, total=False):
    role: str
    content: str
    metadata: MessageMetadata

# 工厂函数和判断函数保持不变（紧耦合于类型定义）
# create_message, create_tool_call_message, create_tool_result_message,
# is_tool_call_message, is_tool_result_message, is_folded
```

### 4.2 lumen/types/events.py（TypedDict）

新建文件，定义 chat_stream 的 5 种 SSE 事件形状：

```python
from typing import TypedDict, Union, List, Optional, Any

class TextEvent(TypedDict):
    type: str          # "text"
    content: str

class DoneEvent(TypedDict):
    type: str          # "done"
    exit_reason: str

class ToolStartEvent(TypedDict, total=False):
    type: str          # "tool_start"
    tool: Union[str, List[str]]
    params: dict
    mode: str          # "parallel" 时存在

class ToolResultEvent(TypedDict, total=False):
    type: str          # "tool_result"
    tool: str
    success: bool
    data: Any
    error: str

class StatusEvent(TypedDict, total=False):
    type: str          # "status"
    status: str
    message: str

SSEEvent = Union[TextEvent, DoneEvent, ToolStartEvent, ToolResultEvent, StatusEvent]
```

### 4.3 lumen/types/tools.py（Pydantic）

新建文件，定义工具协议（所有工具必须返回标准形状）：

```python
from pydantic import BaseModel, ConfigDict
from typing import Any, Optional, List, Dict, Union

class ToolResult(BaseModel):
    model_config = ConfigDict(extra="allow")  # 允许工具返回额外字段

    success: bool
    tool: str
    data: Any = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    timestamp: Optional[str] = None
    execution_time: Optional[float] = None
    error_detail: Optional[Dict[str, Any]] = None

class SingleToolCall(BaseModel):
    mode: str = "single"
    tool: str
    params: Dict[str, Any] = {}
    call_id: Optional[str] = None

class ParallelToolCall(BaseModel):
    mode: str = "parallel"
    calls: List[SingleToolCall]

ParsedToolCall = Union[SingleToolCall, ParallelToolCall]
```

### 4.4 lumen/prompt/types.py

```python
from pydantic import BaseModel
from typing import Optional, List
from typing import TypedDict

class CharacterCard(BaseModel):
    name: str
    system_prompt: str = ""
    description: Optional[str] = None
    greeting: Optional[str] = None
    tools: List[str] = []
    model: Optional[str] = None

class DynamicContext(TypedDict):
    content: str
    injection_point: str
```

### 4.5 lumen/services/types.py

```python
from typing import TypedDict

class SearchResult(TypedDict):
    title: str
    url: str
    snippet: str

class SessionInfo(TypedDict):
    session_id: str
    character_id: str
    created_at: str
```

### 4.6 lumen/tools/types.py

```python
from typing import TypedDict

class ErrorCode:
    PARAM_MISSING = "PARAM.MISSING"
    PARAM_INVALID = "PARAM.INVALID"
    PARAM_EMPTY = "PARAM.EMPTY"
    PARAM_TYPE = "PARAM.TYPE"
    EXEC_TIMEOUT = "EXEC.TIMEOUT"
    EXEC_FAILED = "EXEC.FAILED"
    EXEC_DENIED = "EXEC.DENIED"
    API_UNAVAILABLE = "API.UNAVAILABLE"
    API_RATE_LIMIT = "API.RATE_LIMIT"
    API_ERROR = "API.ERROR"
    TOOL_UNKNOWN = "TOOL.UNKNOWN"
    TOOL_BROKEN = "TOOL.BROKEN"

class ToolDefinition(TypedDict, total=False):
    description: str
    parameters: dict
```

### 4.7 lumen/core/types.py

预留文件。ChatSession 已是 dataclass，暂不改动。后续 core 模块有新的内部状态类型时在此添加。

---

## 5. CLAUDE.md 新增规则

在"执行规则"部分新增"类型系统规则"子节：

```markdown
### 类型系统规则

- **全局类型**（跨 3+ 模块）→ `lumen/types/`，按领域拆文件（messages、events、tools）
- **模块类型**（1-2 个模块用）→ 就近放 `模块/types.py`（如 `prompt/types.py`）
- **边界用 Pydantic**：LLM 输出、数据库、HTTP、JSON 文件 — 外部数据进门时验证
- **内部用 TypedDict**：模块间传递、SSE 事件 — 零开销，IDE 能提示
- **类型文件只放类型定义**和紧耦合的构造/判断函数，不放业务逻辑
- **模块拆分/合并/新增时**，照此规则分配类型归属
```

---

## 6. 迁移策略

采用**方案 B：分层推进**，按依赖顺序从底层到上层：

| 阶段 | 内容 | 影响文件 |
|------|------|---------|
| 1 | 创建类型定义文件 | types/ 新建 2 文件，模块新建 4 个 types.py |
| 2 | 重构 types/messages.py | MessageMetadata 改 TypedDict |
| 3 | 重构 tools/base.py | success_result/error_result 返回 ToolResult，ErrorCode 搬到 tools/types.py |
| 4 | 重构 tools/parse.py | 返回 ParsedToolCall |
| 5 | 重构 core/chat.py | 引用新类型，SSE 事件用 TypedDict 构造 |
| 6 | 重构 services/ | search.py 用 SearchResult，history.py 用 Pydantic 校验 DB 读取 |
| 7 | 重构 prompt/ | character.py 加载时用 CharacterCard 校验 |
| 8 | 更新 CLAUDE.md + CODE_INDEX.md | 记录规则和文件变动 |

每阶段完成后可独立运行测试。

---

## 7. 风险与约束

- **Pydantic 依赖**：项目 requirements.txt 已有 pydantic（FastAPI 自带），无需额外安装
- **向后兼容**：TypedDict 是 dict 的子类型，Pydantic 模型可 `.model_dump()` 转回 dict，过渡期间可混用
- **性能影响**：Pydantic 校验仅在边界（LLM 调用、DB 读取、HTTP）发生，内部传递零开销
