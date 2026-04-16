# 类型系统重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Lumen 全部核心数据结构建立显式类型定义，边界用 Pydantic 校验，内部用 TypedDict 提示。

**Architecture:** 分层推进，从底层类型定义开始，逐层向上重构消费者代码。每个阶段独立可测。

**Tech Stack:** Python 3.11 TypedDict + Pydantic v2（FastAPI 自带）

**设计文档:** `docs/superpowers/specs/2026-04-16-type-system-refactoring-design.md`

---

## 文件变更清单

### 新建文件（6 个）
- `lumen/types/events.py` — SSE 事件 TypedDict
- `lumen/types/tools.py` — ToolResult、ParsedToolCall Pydantic
- `lumen/tools/types.py` — ErrorCode、ToolDefinition
- `lumen/services/types.py` — SearchResult、SessionInfo
- `lumen/prompt/types.py` — CharacterCard Pydantic、DynamicContext TypedDict
- `lumen/core/types.py` — 预留（暂为空壳）

### 修改文件（11 个）
- `lumen/__init__.py` — ErrorCode 导入源保持不变（base.py re-export）
- `lumen/types/__init__.py` — 添加新模块的 re-export
- `lumen/types/messages.py` — MessageMetadata 改 TypedDict，更新工厂函数
- `lumen/tools/base.py` — success_result/error_result 用 ToolResult 校验，ErrorCode 搬走
- `lumen/tools/parse.py` — 返回值用 ParsedToolCall 校验
- `lumen/core/chat.py` — 引用新类型，SSE 事件用 TypedDict
- `lumen/services/search.py` — 返回类型标注
- `lumen/services/history.py` — 返回类型标注
- `lumen/services/memory.py` — 参数类型标注
- `lumen/services/context/manager.py` — 参数类型标注
- `lumen/prompt/character.py` — 加载时用 CharacterCard 校验
- `lumen/prompt/builder.py` — 参数类型标注
- `CLAUDE.md` — 添加类型系统规则
- `CODE_INDEX.md` — 记录文件变动

---

## Task 1: 创建 lumen/types/events.py

**Files:**
- Create: `lumen/types/events.py`

- [ ] **Step 1: 创建 SSE 事件类型文件**

```python
"""
Lumen - SSE 事件类型定义
chat_stream yield 的事件形状，全部用 TypedDict（零开销，IDE 提示）
"""

from typing import TypedDict, Union, List, Optional, Any


class TextEvent(TypedDict):
    """文本片段事件"""
    type: str          # "text"
    content: str


class DoneEvent(TypedDict):
    """流式结束事件"""
    type: str          # "done"
    exit_reason: str   # "completed" | "completed_after_tools" | "max_iterations"


class ToolStartEvent(TypedDict, total=False):
    """工具开始执行事件"""
    type: str          # "tool_start"
    tool: Union[str, List[str]]  # 单个工具名或并行工具名列表
    params: dict       # 工具参数
    mode: str          # "parallel" 时存在


class ToolResultEvent(TypedDict, total=False):
    """工具执行结果事件"""
    type: str          # "tool_result"
    tool: str          # 工具名
    success: bool      # 是否成功
    data: Any          # 成功时的数据
    error: str         # 失败时的错误信息


class StatusEvent(TypedDict, total=False):
    """状态变化事件"""
    type: str          # "status"
    status: str        # "tool_error" | "max_iterations" 等
    message: str       # 状态详情


# chat_stream 的 yield 类型
SSEEvent = Union[TextEvent, DoneEvent, ToolStartEvent, ToolResultEvent, StatusEvent]
```

- [ ] **Step 2: Commit**

```bash
git add lumen/types/events.py
git commit -m "feat(types): 新增 SSE 事件 TypedDict 定义"
```

---

## Task 2: 创建 lumen/types/tools.py

**Files:**
- Create: `lumen/types/tools.py`

- [ ] **Step 1: 创建工具协议类型文件**

```python
"""
Lumen - 工具协议类型定义（Pydantic）
所有工具必须返回标准格式，用 Pydantic 强制校验
"""

from pydantic import BaseModel, ConfigDict
from typing import Any, Optional, List, Dict, Union


class ToolResult(BaseModel):
    """工具执行结果 — 每个工具必须返回这个形状"""
    model_config = ConfigDict(extra="allow")  # 允许工具返回额外字段（如 execution_time）

    success: bool
    tool: str
    data: Any = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    timestamp: Optional[str] = None
    execution_time: Optional[float] = None
    error_detail: Optional[Dict[str, Any]] = None


class SingleToolCall(BaseModel):
    """解析出的单个工具调用"""
    model_config = ConfigDict(extra="allow")

    mode: str = "single"
    tool: str = ""
    params: Dict[str, Any] = {}
    call_id: Optional[str] = None
    run_in_background: Optional[bool] = None


class ParallelToolCall(BaseModel):
    """解析出的并行工具调用"""
    mode: str = "parallel"
    calls: List[Dict[str, Any]] = []
    call_id: Optional[str] = None


ParsedToolCall = Union[SingleToolCall, ParallelToolCall]
```

- [ ] **Step 2: Commit**

```bash
git add lumen/types/tools.py
git commit -m "feat(types): 新增 ToolResult/ParsedToolCall Pydantic 模型"
```

---

## Task 3: 创建 lumen/tools/types.py

**Files:**
- Create: `lumen/tools/types.py`

- [ ] **Step 1: 创建工具模块专用类型文件**

```python
"""
Lumen - 工具系统专用类型
ErrorCode 常量和 ToolDefinition 结构
"""

from typing import TypedDict, Any, Dict


class ErrorCode:
    """工具执行错误代码

    格式：类别.子类.具体错误
    """
    # 参数错误
    PARAM_MISSING = "PARAM.MISSING"
    PARAM_INVALID = "PARAM.INVALID"
    PARAM_EMPTY = "PARAM.EMPTY"
    PARAM_TYPE = "PARAM.TYPE"

    # 执行错误
    EXEC_TIMEOUT = "EXEC.TIMEOUT"
    EXEC_FAILED = "EXEC.FAILED"
    EXEC_DENIED = "EXEC.DENIED"

    # 外部服务错误
    API_UNAVAILABLE = "API.UNAVAILABLE"
    API_RATE_LIMIT = "API.RATE_LIMIT"
    API_ERROR = "API.ERROR"

    # 工具错误
    TOOL_UNKNOWN = "TOOL.UNKNOWN"
    TOOL_BROKEN = "TOOL.BROKEN"


class ToolDefinition(TypedDict, total=False):
    """从 registry.json 加载的工具定义"""
    description: str
    parameters: Dict[str, Any]
```

- [ ] **Step 2: Commit**

```bash
git add lumen/tools/types.py
git commit -m "feat(tools): 新增工具模块专用类型（ErrorCode、ToolDefinition）"
```

---

## Task 4: 创建 lumen/services/types.py

**Files:**
- Create: `lumen/services/types.py`

- [ ] **Step 1: 创建服务模块专用类型文件**

```python
"""
Lumen - 服务层专用类型
搜索结果、会话信息等
"""

from typing import TypedDict


class SearchResult(TypedDict):
    """搜索结果条目"""
    title: str
    url: str
    snippet: str


class SessionInfo(TypedDict):
    """会话列表项"""
    session_id: str
    character_id: str
    created_at: str
```

- [ ] **Step 2: Commit**

```bash
git add lumen/services/types.py
git commit -m "feat(services): 新增服务层专用类型（SearchResult、SessionInfo）"
```

---

## Task 5: 创建 lumen/prompt/types.py

**Files:**
- Create: `lumen/prompt/types.py`

- [ ] **Step 1: 创建提示词模块专用类型文件**

```python
"""
Lumen - 提示词模块专用类型
CharacterCard（Pydantic）校验 JSON 文件加载
DynamicContext（TypedDict）内部传递
"""

from pydantic import BaseModel
from typing import Optional, List
from typing import TypedDict


class CharacterCard(BaseModel):
    """角色卡片 — 从 JSON 文件加载时校验"""
    name: str
    system_prompt: str = ""
    description: Optional[str] = None
    greeting: Optional[str] = None
    tools: List[str] = []
    model: Optional[str] = None


class DynamicContext(TypedDict):
    """动态上下文注入项"""
    content: str
    injection_point: str  # "system" | "before_user" | "after_user"
```

- [ ] **Step 2: Commit**

```bash
git add lumen/prompt/types.py
git commit -m "feat(prompt): 新增角色卡片和动态上下文类型定义"
```

---

## Task 6: 创建 lumen/core/types.py

**Files:**
- Create: `lumen/core/types.py`

- [ ] **Step 1: 创建预留文件**

```python
"""
Lumen - 核心模块专用类型

ChatSession 已是 dataclass，暂不改动。
后续 core 模块有新的内部状态类型时在此添加。
"""
```

- [ ] **Step 2: Commit**

```bash
git add lumen/core/types.py
git commit -m "feat(core): 新增类型文件（预留）"
```

---

## Task 7: 重构 lumen/types/messages.py

**关键变更：** `MessageMetadata` 从手写 class 改为 TypedDict。工厂函数从构造器调用改为字典构建。

**Files:**
- Modify: `lumen/types/messages.py`
- Modify: `lumen/types/__init__.py`

- [ ] **Step 1: 重写 messages.py**

将整个文件替换为以下内容：

```python
"""
Lumen - 消息类型和元数据定义
支持上下文折叠的消息类型系统
"""

import json
import uuid
from datetime import datetime
from typing import TypedDict, Optional, List, Dict, Any


# ========================================
# 消息类型定义
# ========================================

class MessageType:
    """消息类型常量"""
    NORMAL = "normal"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOOL_RESULT_PARALLEL = "tool_result_parallel"


class FoldReason:
    """折叠原因"""
    AI_PROCESSED = "ai_processed"
    OLD_TOKEN_LIMIT = "old_token_limit"
    USER_REQUEST = "user_request"


# ========================================
# 消息类型（TypedDict — 内部传递，零开销）
# ========================================

class MessageMetadata(TypedDict, total=False):
    """消息元数据"""
    type: str
    folded: bool
    tool_name: str
    tool_count: int


class Message(TypedDict, total=False):
    """聊天消息"""
    role: str
    content: str
    metadata: MessageMetadata


# ========================================
# 消息辅助函数
# ========================================

def create_message(role: str,
                   content: str,
                   msg_type: str = MessageType.NORMAL,
                   **metadata_kwargs) -> Message:
    """创建带有元数据的消息

    Args:
        role: 消息角色（user/assistant/system）
        content: 消息内容
        msg_type: 消息类型
        **metadata_kwargs: 额外的元数据字段（tool_name, tool_call_id 等）

    Returns:
        完整的消息字典
    """
    metadata: MessageMetadata = {"type": msg_type, **metadata_kwargs}
    metadata.setdefault("folded", False)
    return {
        "role": role,
        "content": content,
        "metadata": metadata,
    }


def create_tool_call_message(tool_name: str, params: Dict,
                              run_in_background: bool = False) -> Message:
    """创建工具调用消息

    Args:
        tool_name: 工具名称
        params: 工具参数
        run_in_background: 是否后台运行

    Returns:
        工具调用消息字典
    """
    call_id = f"call_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    tool_call = {
        "type": "tool_call",
        "id": call_id,
        "tool": tool_name,
        "params": params,
    }

    if run_in_background:
        tool_call["run_in_background"] = True

    return create_message(
        role="assistant",
        content=json.dumps(tool_call, ensure_ascii=False),
        msg_type=MessageType.TOOL_CALL,
        tool_name=tool_name,
        tool_call_id=call_id,
    )


def create_tool_result_message(result: Dict[str, Any],
                                tool_call_id: Optional[str] = None) -> Message:
    """创建工具结果消息

    Args:
        result: 工具执行结果（来自 execute_tool）
        tool_call_id: 关联的工具调用 ID

    Returns:
        工具结果消息字典
    """
    tool_result = {
        "type": "tool_result",
        "tool_call_id": tool_call_id,
        "result": result,
    }

    return create_message(
        role="user",
        content=json.dumps(tool_result, ensure_ascii=False),
        msg_type=MessageType.TOOL_RESULT,
        tool_name=result.get("tool"),
        tool_call_id=tool_call_id,
        folded=False,
    )


def create_tool_result_parallel_message(results: List[Dict[str, Any]]) -> Message:
    """创建并行工具结果消息"""
    return create_message(
        role="user",
        content=json.dumps(results, ensure_ascii=False),
        msg_type=MessageType.TOOL_RESULT_PARALLEL,
        tool_count=len(results),
        folded=False,
    )


def is_tool_call_message(msg: Message) -> bool:
    """判断是否是工具调用消息"""
    metadata = msg.get("metadata", {})
    return metadata.get("type") == MessageType.TOOL_CALL


def is_tool_result_message(msg: Message) -> bool:
    """判断是否是工具结果消息"""
    metadata = msg.get("metadata", {})
    msg_type = metadata.get("type")
    return msg_type in [MessageType.TOOL_RESULT, MessageType.TOOL_RESULT_PARALLEL]


def is_folded(msg: Message) -> bool:
    """判断消息是否已折叠"""
    metadata = msg.get("metadata", {})
    return metadata.get("folded", False)


# ========================================
# 导出
# ========================================

__all__ = [
    "MessageType",
    "MessageMetadata",
    "Message",
    "FoldReason",
    "create_message",
    "create_tool_call_message",
    "create_tool_result_message",
    "create_tool_result_parallel_message",
    "is_tool_call_message",
    "is_tool_result_message",
    "is_folded",
]
```

- [ ] **Step 2: 更新 types/__init__.py**

```python
"""
Lumen 类型定义 — 消息类型、事件、工具协议
"""

from lumen.types.messages import (
    MessageType,
    MessageMetadata,
    Message,
    FoldReason,
    create_message,
    create_tool_call_message,
    create_tool_result_message,
    create_tool_result_parallel_message,
    is_tool_call_message,
    is_tool_result_message,
    is_folded,
)

from lumen.types.events import (
    TextEvent,
    DoneEvent,
    ToolStartEvent,
    ToolResultEvent,
    StatusEvent,
    SSEEvent,
)

from lumen.types.tools import (
    ToolResult,
    SingleToolCall,
    ParallelToolCall,
    ParsedToolCall,
)
```

- [ ] **Step 3: Commit**

```bash
git add lumen/types/messages.py lumen/types/__init__.py
git commit -m "refactor(types): MessageMetadata 改 TypedDict，添加新模块 re-export"
```

---

## Task 8: 重构 lumen/tools/base.py

**关键变更：**
- `ErrorCode` 从 base.py 搬到 `lumen/tools/types.py`
- `success_result` / `error_result` 用 `ToolResult` Pydantic 校验后返回 dict
- `format_result_for_ai` 参数类型标注

**Files:**
- Modify: `lumen/tools/base.py`

- [ ] **Step 1: 重写 base.py**

```python
"""
Lumen - 工具执行引擎
结果格式化（Pydantic 校验）、工具分发、并行执行
"""

import json
import time
from datetime import datetime
from typing import List, Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from lumen.tools.types import ErrorCode  # 保留此导入：calculate.py 和 web_search.py 通过 base.py 间接导入 ErrorCode
from lumen.types.tools import ToolResult


# ========================================
# 返回值辅助函数（Pydantic 校验 → 返回 dict）
# ========================================

def success_result(tool: str, data: Any, **metadata) -> Dict[str, Any]:
    """构造成功结果（Pydantic 校验后返回 dict）"""
    result = ToolResult(
        success=True,
        tool=tool,
        data=data,
        timestamp=datetime.now().isoformat(),
        **metadata,
    )
    return result.model_dump(exclude_none=True)


def error_result(tool: str, code: str, message: str, detail: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """构造错误结果（Pydantic 校验后返回 dict）"""
    result = ToolResult(
        success=False,
        tool=tool,
        error_code=code,
        error_message=message,
        timestamp=datetime.now().isoformat(),
        error_detail=detail,
    )
    return result.model_dump(exclude_none=True)


def format_result_for_ai(result: Dict[str, Any]) -> str:
    """将工具结果格式化为适合发送给 AI 的字符串

    只包含关键信息，减少 token 消耗
    """
    tool = result["tool"]

    if result["success"]:
        data = result["data"]
        if isinstance(data, str):
            return f"[{tool}] {data}"
        else:
            return f"[{tool}] {json.dumps(data, ensure_ascii=False)}"
    else:
        return f"[{tool} 错误] {result['error_message']}"


# ========================================
# 工具注册表（名称 → 执行函数的映射）
# ========================================

_TOOL_HANDLERS: Dict[str, callable] = {}


def register_handler(name: str, handler: callable):
    """注册工具执行函数"""
    _TOOL_HANDLERS[name] = handler


def _load_builtin_tools():
    """加载内置工具（延迟导入，避免循环依赖）"""
    from lumen.tools.calculate import execute as exec_calc
    register_handler("calculate", exec_calc)

    from lumen.tools.web_search import execute as exec_search
    register_handler("web_search", exec_search)


# ========================================
# 工具执行
# ========================================

def execute_tool(name: str, params: dict) -> Dict[str, Any]:
    """执行工具调用，返回标准化结果"""
    start_time = time.perf_counter()

    if not isinstance(params, dict):
        return error_result(
            name,
            ErrorCode.PARAM_TYPE,
            f"参数必须是字典类型，收到: {type(params).__name__}",
        )

    if not _TOOL_HANDLERS:
        _load_builtin_tools()

    handler = _TOOL_HANDLERS.get(name)
    if handler:
        result = handler(params)
        # 补充执行时间（如果工具自己没算）
        if "execution_time" not in result:
            result["execution_time"] = round((time.perf_counter() - start_time) * 1000, 2)
        return result

    return error_result(
        name,
        ErrorCode.TOOL_UNKNOWN,
        f"未知工具: {name}",
    )


def execute_tools_parallel(calls: List[Dict], max_workers: int = 5, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
    """并发执行多个工具调用"""
    if not calls:
        return []

    if not isinstance(calls, list):
        raise TypeError(f"calls 必须是列表类型，收到: {type(calls)}")

    for i, call in enumerate(calls):
        if not isinstance(call, dict):
            raise TypeError(f"calls[{i}] 必须是字典类型，收到: {type(call)}")
        if "tool" not in call:
            raise ValueError(f"calls[{i}] 缺少必需的 'tool' 字段")

    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {}
        for i, call in enumerate(calls):
            try:
                future = executor.submit(execute_tool, call["tool"], call.get("params", {}))
                future_to_index[future] = i
            except Exception as e:
                results.append(error_result(
                    call["tool"],
                    ErrorCode.EXEC_FAILED,
                    f"工具提交失败: {e}",
                ))

        index_to_result = {}
        for future in as_completed(future_to_index):
            index = future_to_index[future]
            try:
                result = future.result(timeout=timeout)
                index_to_result[index] = result
            except TimeoutError:
                index_to_result[index] = error_result(
                    calls[index]["tool"],
                    ErrorCode.EXEC_TIMEOUT,
                    f"工具执行超时（{timeout}秒）"
                )
            except Exception as e:
                index_to_result[index] = error_result(
                    calls[index]["tool"],
                    ErrorCode.EXEC_FAILED,
                    f"工具执行异常: {type(e).__name__}: {e}"
                )

        for i, call in enumerate(calls):
            if i < len(results):
                continue
            if i in index_to_result:
                results.append(index_to_result[i])
            else:
                results.append(error_result(
                    call["tool"],
                    ErrorCode.EXEC_FAILED,
                    "未知错误"
                ))

    return results


# ========================================
# 从注册表生成工具提示词
# ========================================

def get_tool_prompt_from_registry(tool_names: List[str] = None) -> str:
    """从工具注册表生成工具提示词"""
    from lumen.tools.registry import get_registry

    registry = get_registry()
    tools_def = registry.get_tools(tool_names)

    if not tools_def:
        return ""

    tool_lines = []
    for name, definition in tools_def.items():
        params = definition.get("parameters", {}).get("properties", {})
        if params:
            param_parts = []
            for param_name, param_info in params.items():
                param_parts.append(f'"{param_name}": {param_info.get("description", param_name)}')
            params_text = "，参数: {" + ", ".join(param_parts) + "}"
        else:
            params_text = ""

        tool_lines.append(f'- {name}: {definition["description"]}{params_text}')

    tools_text = "\n".join(tool_lines)

    return f"""<tools>
你可以使用以下工具来帮助用户：
{tools_text}

在使用工具前，请先思考：
1. 用户的问题是否需要使用工具？
2. 如果需要，应该使用哪个（些）工具？
3. 这些工具之间是否有依赖关系？（后一个工具需要前一个的结果）
4. 工具的参数是否齐全？如果参数不齐全，请先询问用户。

当你需要使用工具时，请使用以下格式：

【单个工具调用】：
{{"type": "tool_call", "tool": "工具名", "params": {{"参数名": "参数值"}}}}

【多个工具并行】（多个工具互不依赖时，会被同时执行）：
{{"type": "tool_call_parallel", "calls": [
  {{"tool": "工具名1", "params": {{...}}}},
  {{"tool": "工具名2", "params": {{...}}}}
]}}

字段说明：
- type: 必填，消息类型（"tool_call" 或 "tool_call_parallel"）
- tool: 必填，工具名称
- params: 必填，工具参数（字典）
- id: 可选，调用ID（系统自动生成，一般不需要手动指定）

规则：
- 涉及数学计算时，必须使用 calculate 工具，不要自己计算
- 只有确实需要使用工具时才输出JSON，普通对话正常回复文字
- type 字段必须包含，否则工具调用会被忽略
- 不要在JSON前后加任何解释文字
- 如果多个工具有依赖关系，请分步调用单个工具
</tools>"""


def get_tool_prompt() -> str:
    """生成工具提示词（包含所有可用工具）"""
    return get_tool_prompt_from_registry(None)
```

- [ ] **Step 2: Commit**

```bash
git add lumen/tools/base.py
git commit -m "refactor(tools): base.py 用 ToolResult Pydantic 校验，ErrorCode 搬到 types.py"
```

---

## Task 9: 重构 lumen/tools/parse.py

**关键变更：** 解析结果用 `ParsedToolCall` Pydantic 校验后返回 dict。

**Files:**
- Modify: `lumen/tools/parse.py`

- [ ] **Step 1: 重写 parse.py**

```python
"""
Lumen - 工具调用解析
从 AI 回复文本中提取工具调用 JSON，Pydantic 校验后返回 dict
"""

import json
from typing import Optional, Dict, Any

from lumen.types.tools import SingleToolCall, ParallelToolCall


def parse_tool_call(text: str) -> Optional[Dict[str, Any]]:
    """从 AI 回复中解析工具调用

    新格式要求：
    - 单个工具: {"type": "tool_call", "tool": "xxx", "params": {...}}
    - 多个工具: {"type": "tool_call_parallel", "calls": [...]}

    返回：
    - 解析成功：标准化的 dict（经 Pydantic 校验）
    - 无工具调用：None
    """
    text = text.strip()

    def extract_json(text: str) -> Optional[dict]:
        """从文本中提取 JSON（支持嵌套花括号）"""
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass

        start_idx = text.find('{')
        if start_idx < 0:
            return None

        brace_count = 0
        in_string = False
        escape = False
        for i in range(start_idx, len(text)):
            char = text[i]

            if escape:
                escape = False
                continue
            if char == '\\':
                escape = True
                continue

            if char == '"':
                in_string = not in_string
                continue

            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_str = text[start_idx:i+1]
                        try:
                            return json.loads(json_str)
                        except (json.JSONDecodeError, ValueError):
                            pass
                        break
        return None

    data = extract_json(text)
    if not data or not isinstance(data, dict):
        return None

    if "type" not in data:
        return None

    msg_type = data.get("type")

    # 单个工具调用 — Pydantic 校验
    if msg_type == "tool_call" and "tool" in data:
        call = SingleToolCall(
            mode="single",
            tool=data["tool"],
            params=data.get("params", {}),
        )
        if "id" in data:
            call.call_id = data["id"]
        if "run_in_background" in data:
            call.run_in_background = data["run_in_background"]
        return call.model_dump(exclude_none=True)

    # 多个工具并行 — Pydantic 校验
    if msg_type == "tool_call_parallel" and "calls" in data:
        parallel = ParallelToolCall(
            mode="parallel",
            calls=data["calls"],
        )
        if "id" in data:
            parallel.call_id = data["id"]
        return parallel.model_dump(exclude_none=True)

    return None
```

- [ ] **Step 2: Commit**

```bash
git add lumen/tools/parse.py
git commit -m "refactor(tools): parse.py 用 ParsedToolCall Pydantic 校验"
```

---

## Task 10: 重构 lumen/core/chat.py

**关键变更：** SSE 事件用 TypedDict 类型标注，参数类型化。

**Files:**
- Modify: `lumen/core/chat.py`

- [ ] **Step 1: 重写 chat.py**

```python
"""
Lumen - 对话核心模块
所有对话逻辑都在这，不管是终端还是网页都调用这里
"""

import json
import logging
from typing import AsyncGenerator

import jsonschema

from lumen.core.session import ChatSession
from lumen.prompt.character import load_character
from lumen.prompt.builder import build_system_prompt
from lumen.services.context import trim_messages, fold_tool_calls, filter_for_ai
from lumen.services import history
from lumen.services import memory
from lumen.tools.base import execute_tool, execute_tools_parallel, get_tool_prompt
from lumen.tools.parse import parse_tool_call
from lumen.config import get_model, MAX_TOOL_ITERATIONS
from lumen.services.llm import chat
from lumen.tools.registry import get_registry
from lumen.prompt.template import render_messages, collect_variables
from lumen.types.messages import Message, MessageType
from lumen.types.events import SSEEvent

logger = logging.getLogger(__name__)


def _prepare_messages(messages: list[Message], character_id: str = "default") -> list[Message]:
    """预处理消息：折叠工具调用 → 裁剪上下文 → 过滤已折叠 → 模板变量替换

    所有发给 LLM 的消息都必须经过这个函数
    """
    folded = fold_tool_calls(messages)
    trimmed = trim_messages(folded)
    filtered = filter_for_ai(trimmed)
    variables = collect_variables(character_id)
    return render_messages(filtered, variables)


def validate_tool_call(tool_name: str, tool_params: dict) -> str:
    """验证 AI 的工具调用是否正确

    Returns:
        None 如果验证通过，错误消息字符串如果验证失败
    """
    registry = get_registry()

    if not registry.exists(tool_name):
        available = registry.list_tools()
        return f"工具 '{tool_name}' 不存在，可用工具: {', '.join(available)}"

    tool_def = registry.get_tool(tool_name)
    params_schema = tool_def.get("parameters", {})

    try:
        jsonschema.validate(instance=tool_params, schema=params_schema)
    except jsonschema.ValidationError as e:
        return f"参数验证失败: {e.message}"

    return None


async def chat_non_stream(user_input: str, session: ChatSession) -> str:
    """非流式：等AI想完了再一次性返回"""
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    trimmed = _prepare_messages(session.messages, session.character_id)
    model = get_model()

    response = await chat(trimmed, model, stream=False)

    reply = response.choices[0].message.content
    session.messages.append({"role": "assistant", "content": reply})
    history.save_message(session.session_id, "assistant", reply)
    return reply


async def chat_stream(user_input: str, session: ChatSession) -> AsyncGenerator[SSEEvent, None]:
    """流式对话（ReAct 循环）

    Yields:
        SSEEvent — TypedDict 类型的事件（text/done/tool_start/tool_result/status）
    """
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    model = get_model()
    exit_reason = "completed"
    tool_iterations = 0

    for iteration in range(MAX_TOOL_ITERATIONS):
        trimmed = _prepare_messages(session.messages, session.character_id)
        response = await chat(trimmed, model, stream=True)

        buffer = ""
        is_tool_call = None
        full_text = ""

        async for chunk in response:
            content = chunk.choices[0].delta.content
            if not content:
                continue

            buffer += content
            full_text += content

            if is_tool_call is None:
                stripped = buffer.strip()
                if stripped:
                    if stripped[0] == '{':
                        is_tool_call = True
                    else:
                        is_tool_call = False
                        yield {"type": "text", "content": buffer}
                        buffer = ""
            elif not is_tool_call:
                yield {"type": "text", "content": content}

        # ---- 处理本轮结果 ----

        if is_tool_call is None or is_tool_call is False:
            if tool_iterations > 0:
                exit_reason = "completed_after_tools"
            session.messages.append({"role": "assistant", "content": full_text})
            history.save_message(session.session_id, "assistant", full_text)
            logger.info(f"[ReAct] 循环结束: {exit_reason}，共 {tool_iterations} 轮工具调用")
            yield {"type": "done", "exit_reason": exit_reason}
            return

        tool_call = parse_tool_call(full_text)

        if not tool_call:
            if tool_iterations > 0:
                exit_reason = "completed_after_tools"
            yield {"type": "text", "content": full_text}
            session.messages.append({"role": "assistant", "content": full_text})
            history.save_message(session.session_id, "assistant", full_text)
            yield {"type": "done", "exit_reason": exit_reason}
            return

        # --- 有工具调用，进入 ReAct 循环 ---
        tool_iterations += 1
        logger.info(f"[ReAct 第{iteration + 1}轮] 检测到工具调用: {tool_call.get('mode')}")

        session.messages.append({"role": "assistant", "content": full_text})

        mode = tool_call.get("mode", "single")

        # ========== 单个工具 ==========
        if mode == "single":
            tool_name = tool_call.get("tool", "")
            tool_params = tool_call.get("params", {})

            validation_error = validate_tool_call(tool_name, tool_params)
            if validation_error:
                logger.warning(f"工具验证失败: {validation_error}")
                yield {"type": "status", "status": "tool_error", "message": validation_error}
                error_feedback = (
                    f"[系统提示] 你的工具调用有误：{validation_error}。"
                    "请重新分析用户需求，选择正确的工具和参数。"
                )
                session.messages.append({"role": "user", "content": error_feedback})
                continue

            yield {"type": "tool_start", "tool": tool_name, "params": tool_params}
            tool_result = execute_tool(tool_name, tool_params)
            logger.info(
                f"工具调用: {tool_name}({tool_params}) → "
                f"{'✅' if tool_result['success'] else '❌'}"
            )
            yield {
                "type": "tool_result",
                "tool": tool_name,
                "success": tool_result["success"],
                "data": tool_result.get("data"),
                "error": tool_result.get("error_message"),
            }

            session.messages.append({
                "role": "user",
                "content": json.dumps(tool_result, ensure_ascii=False),
                "metadata": {
                    "type": "tool_result",
                    "tool_name": tool_name,
                    "folded": False,
                },
            })

        # ========== 多个工具并行 ==========
        elif mode == "parallel":
            calls = tool_call.get("calls", [])

            all_errors = []
            for call in calls:
                error = validate_tool_call(call.get("tool", ""), call.get("params", {}))
                if error:
                    all_errors.append(f"- {call.get('tool')}: {error}")

            if all_errors:
                logger.warning(f"并行工具验证失败:\n" + "\n".join(all_errors))
                yield {"type": "status", "status": "tool_error", "message": "并行工具验证失败"}
                error_feedback = (
                    "[系统提示] 你的并行工具调用有误：\n"
                    + "\n".join(all_errors)
                    + "\n请重新分析用户需求，选择正确的工具和参数。"
                )
                session.messages.append({"role": "user", "content": error_feedback})
                continue

            tool_names = [c.get("tool") for c in calls]
            yield {"type": "tool_start", "tool": tool_names, "mode": "parallel"}
            logger.info(f"并行执行 {len(calls)} 个工具...")
            results = execute_tools_parallel(calls)

            for r in results:
                status = "✅" if r["success"] else "❌"
                logger.info(f"  - {r['tool']}: {status}")
                yield {
                    "type": "tool_result",
                    "tool": r["tool"],
                    "success": r["success"],
                    "data": r.get("data"),
                    "error": r.get("error_message"),
                }

            session.messages.append({
                "role": "user",
                "content": json.dumps(results, ensure_ascii=False),
                "metadata": {
                    "type": "tool_result_parallel",
                    "tool_count": len(results),
                    "folded": False,
                },
            })

    # 达到最大迭代次数
    exit_reason = "max_iterations"
    logger.warning(
        f"[ReAct] 达到最大工具调用次数限制 ({MAX_TOOL_ITERATIONS})，强制输出回答"
    )
    yield {"type": "status", "status": "max_iterations"}

    session.messages.append({
        "role": "user",
        "content": (
            "[系统提示] 已达到最大思考轮次限制。"
            "请基于已有的工具执行结果，直接给出最终回答，不要再调用工具。"
        ),
    })
    trimmed = _prepare_messages(session.messages, session.character_id)
    response = await chat(trimmed, model, stream=True)

    final_reply = ""
    async for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            final_reply += content
            yield {"type": "text", "content": content}

    session.messages.append({"role": "assistant", "content": final_reply})
    history.save_message(session.session_id, "assistant", final_reply)
    yield {"type": "done", "exit_reason": exit_reason}
```

- [ ] **Step 2: Commit**

```bash
git add lumen/core/chat.py
git commit -m "refactor(core): chat.py 使用 TypedDict 事件类型 + AsyncGenerator 标注"
```

---

## Task 11: 重构 services/ 层

**关键变更：** 添加类型标注到参数和返回值。

**Files:**
- Modify: `lumen/services/search.py`
- Modify: `lumen/services/history.py`
- Modify: `lumen/services/memory.py`
- Modify: `lumen/services/context/manager.py`
- Modify: `lumen/services/llm.py`

- [ ] **Step 1: 更新 search.py — 添加 SearchResult 类型标注**

在 `search.py` 顶部添加 import，修改函数签名：

```python
# 添加到文件顶部的 import 区域：
from lumen.services.types import SearchResult

# 修改 _duckduckgo_search 返回类型：
def _duckduckgo_search(query: str, max_results: int = 5) -> list[SearchResult]:

# 修改 search 返回类型：
def search(query: str, max_results: int = 5, backend: str = None) -> list[SearchResult]:
```

- [ ] **Step 2: 更新 history.py — 添加类型标注**

在 `history.py` 顶部添加 import，修改函数签名：

```python
# 添加到 import 区域：
from lumen.types.messages import Message
from lumen.services.types import SessionInfo

# 修改 load_session 返回类型：
def load_session(session_id: str) -> list[Message]:

# 修改 list_sessions 返回类型：
def list_sessions(limit: int = 20) -> list[SessionInfo]:
    """列出最近的会话"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, character_id, created_at FROM sessions ORDER BY updated_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [
        {"session_id": row["id"], "character_id": row["character_id"], "created_at": row["created_at"]}
        for row in rows
    ]
```

注意：`list_sessions` 原来返回 `[(id, character_id, created_at)]` 元组列表，现在改为返回 `[{"session_id": ..., ...}]` TypedDict 列表。需要同步修改消费者 `api/routes/session.py` 中对元组的解包。在 `session.py` 中将 `session_id, character_id, created_at = session_tuple` 改为 `session["session_id"]` 等字典访问。

- [ ] **Step 3: 更新 memory.py — 添加类型标注**

```python
# 添加到 import 区域：
from lumen.types.messages import Message

# 修改函数签名：
async def generate_summary(messages: list[Message]) -> str:

async def summarize_session(session_id: str, character_id: str, messages: list[Message]):
```

- [ ] **Step 4: 更新 context/manager.py — 添加类型标注**

```python
# 添加到 import 区域：
from lumen.types.messages import Message

# 修改函数签名：
def fold_tool_calls(messages: list[Message]) -> list[Message]:
def filter_for_ai(messages: list[Message]) -> list[Message]:
def trim_messages(messages: list[Message], max_messages: int = 50) -> list[Message]:
```

- [ ] **Step 5: 更新 llm.py — 添加类型标注**

```python
# 添加到 import 区域：
from lumen.types.messages import Message

# 修改函数签名：
async def chat(messages: list[Message], model: str, stream: bool = False):

async def _openai_chat(messages: list[Message], model: str, stream: bool = False):
```

- [ ] **Step 6: 同步修改 api/routes/session.py — 适配 list_sessions 新返回格式**

`session.py` 第 108-115 行的 `list_sessions` 端点使用元组索引，需改为字典访问：

```python
# 将原来的：
return [
    SessionListItem(
        session_id=s[0],
        character_id=s[1],
        created_at=s[2],
        message_count=0
    )
    for s in sessions
]

# 改为：
return [
    SessionListItem(
        session_id=s["session_id"],
        character_id=s["character_id"],
        created_at=s["created_at"],
        message_count=0
    )
    for s in sessions
]
```

- [ ] **Step 7: Commit**

```bash
git add lumen/services/search.py lumen/services/history.py lumen/services/memory.py lumen/services/context/manager.py lumen/services/llm.py api/routes/session.py
git commit -m "refactor(services): 添加 Message/SearchResult/SessionInfo 类型标注"
```

---

## Task 12: 重构 prompt/ 层

**关键变更：** `load_character` 加载时用 CharacterCard Pydantic 校验，builder 函数参数类型化。

**Files:**
- Modify: `lumen/prompt/character.py`
- Modify: `lumen/prompt/builder.py`

- [ ] **Step 1: 更新 character.py — 加载时 Pydantic 校验**

```python
"""
Lumen - 角色卡片管理
加载和管理 characters/ 目录下的角色定义文件
"""

import json
import os
import re
import logging

from lumen.prompt.types import CharacterCard

logger = logging.getLogger(__name__)

CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "characters")


def _validate_char_id(char_id: str) -> str:
    """校验角色ID合法性，防止路径穿越"""
    if not re.match(r'^[a-zA-Z0-9_\-]+$', char_id):
        raise ValueError(f"非法的角色ID: {char_id}")
    return char_id


def list_characters() -> list[tuple[str, str]]:
    """列出所有可用角色，返回 [(文件名, 角色名), ...]"""
    characters = []
    if not os.path.exists(CHARACTERS_DIR):
        return characters

    for filename in os.listdir(CHARACTERS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(CHARACTERS_DIR, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                card = CharacterCard.model_validate(raw)
            except Exception as e:
                logger.warning("跳过损坏的角色文件 %s: %s", filename, e)
                continue
            char_id = filename[:-5]
            characters.append((char_id, card.name))
    return characters


def load_character(char_id: str) -> dict:
    """加载角色卡片，用 CharacterCard Pydantic 校验后返回 dict

    返回 dict（而非 Pydantic 模型）以保持向后兼容
    """
    _validate_char_id(char_id)
    filepath = os.path.join(CHARACTERS_DIR, f"{char_id}.json")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"角色不存在: {char_id}")

    with open(filepath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Pydantic 校验：缺少必填字段或类型错误会抛出 ValidationError
    card = CharacterCard.model_validate(raw)
    return card.model_dump(exclude_none=True)
```

- [ ] **Step 2: 更新 builder.py — 添加类型标注**

```python
# 添加到 import 区域：
from lumen.prompt.types import DynamicContext

# 修改函数签名：
def build_system_prompt(character: dict, dynamic_context: list[DynamicContext] = None) -> str:

def build_messages(character: dict, user_input: str, history: list, dynamic_context: list[DynamicContext] = None):
```

- [ ] **Step 3: Commit**

```bash
git add lumen/prompt/character.py lumen/prompt/builder.py
git commit -m "refactor(prompt): character.py 用 CharacterCard Pydantic 校验，builder 添加类型标注"
```

---

## Task 13: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在"执行规则"部分的"工作流程"之后添加类型系统规则**

在 `### 工作流程` 的第 4 条之后，插入：

```markdown

### 类型系统规则

- **全局类型**（跨 3+ 模块）→ `lumen/types/`，按领域拆文件（messages、events、tools）
- **模块类型**（1-2 个模块用）→ 就近放 `模块/types.py`（如 `prompt/types.py`、`services/types.py`）
- **边界用 Pydantic**：LLM 输出解析、数据库读取、HTTP 请求/响应、JSON 配置文件 — 外部数据进门时验证
- **内部用 TypedDict**：模块间消息传递、SSE 事件构造 — 零开销，IDE 能提示
- **类型文件只放类型定义**和紧耦合的构造/判断函数，不放业务逻辑
- **模块拆分/合并/新增时**，照此规则分配类型归属
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 添加类型系统规则"
```

---

## Task 14: 更新 CODE_INDEX.md

**Files:**
- Modify: `CODE_INDEX.md`

- [ ] **Step 1: 更新 types/ 目录说明**

在 `### types/ — 类型定义` 表格中，更新为：

```markdown
### types/ — 类型定义

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `messages.py` | 消息类型和元数据（TypedDict） | `Message`, `MessageMetadata`, `MessageType`, `create_message()`, `is_folded()` |
| `events.py` | SSE 事件类型（TypedDict） | `TextEvent`, `DoneEvent`, `ToolStartEvent`, `SSEEvent` |
| `tools.py` | 工具协议类型（Pydantic） | `ToolResult`, `ParsedToolCall`, `SingleToolCall` |
```

在目录结构树中，更新 types/ 部分：

```
│   ├── types/                    # 类型定义 — "词汇"
│   │   ├── __init__.py           # 统一 re-export
│   │   ├── messages.py           # 消息类型（TypedDict）+ 工厂函数
│   │   ├── events.py             # SSE 事件类型（TypedDict）
│   │   └── tools.py              # 工具协议类型（Pydantic）
```

在各模块目录中添加 types.py 条目：

```
│   ├── core/
│   │   ├── types.py              # core 专用类型（预留）
│   │   ├── chat.py
│   │   └── session.py
│
│   ├── tools/
│   │   ├── types.py              # ErrorCode、ToolDefinition
│   │   ├── base.py
│   │   ...
│
│   ├── services/
│   │   ├── types.py              # SearchResult、SessionInfo
│   │   ...
│
│   ├── prompt/
│   │   ├── types.py              # CharacterCard（Pydantic）、DynamicContext
│   │   ...
```

在更新日志中添加：

```markdown
| 2026-04-16 | types/: 新增 events.py、tools.py | SSE 事件和工具协议类型定义 |
| 2026-04-16 | 各模块新增 types.py | 模块专用类型就近放置 |
| 2026-04-16 | messages.py: MessageMetadata 改 TypedDict | 零开销类型提示 |
| 2026-04-16 | tools/base.py: 用 ToolResult Pydantic 校验 | 边界校验 + 向后兼容 |
| 2026-04-16 | tools/parse.py: 用 ParsedToolCall 校验 | LLM 输出边界验证 |
| 2026-04-16 | prompt/character.py: 用 CharacterCard 校验 | JSON 文件加载验证 |
| 2026-04-16 | services/: 添加类型标注 | Message/SearchResult/SessionInfo |
```

- [ ] **Step 2: Commit**

```bash
git add CODE_INDEX.md
git commit -m "docs: CODE_INDEX.md 记录类型系统重构变动"
```

---

## Task 15: 冒烟测试

- [ ] **Step 1: 启动后端验证无导入错误**

```bash
cd f:/AI/tools/VCP/Lumen
python -c "from lumen.types import Message, SSEEvent, ToolResult; print('types OK')"
python -c "from lumen.tools.types import ErrorCode; print('tools/types OK')"
python -c "from lumen.services.types import SearchResult; print('services/types OK')"
python -c "from lumen.prompt.types import CharacterCard; print('prompt/types OK')"
python -c "from lumen.tools.base import execute_tool; print('tools/base OK')"
python -c "from lumen.tools.parse import parse_tool_call; print('tools/parse OK')"
python -c "from lumen.core.chat import chat_stream; print('core/chat OK')"
python -c "from lumen.services.search import search; print('services/search OK')"
```

所有命令应输出 `XXX OK`，无 ImportError。

- [ ] **Step 2: 启动 FastAPI 服务验证正常运行**

```bash
cd f:/AI/tools/VCP/Lumen
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

验证服务启动无报错，可以响应请求。

- [ ] **Step 3: 测试 Pydantic 校验生效**

```bash
python -c "
from lumen.types.tools import ToolResult
# 测试正常构造
r = ToolResult(success=True, tool='test', data='hello')
print(r.model_dump())

# 测试缺少必填字段 → 应该报错
try:
    ToolResult(tool='test')
except Exception as e:
    print(f'校验拦截: {e}')
"
```

预期输出：
```
{'success': True, 'tool': 'test', 'data': 'hello', ...}
校验拦截: ... (Pydantic ValidationError)
```
