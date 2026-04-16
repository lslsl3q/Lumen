# 角色切换 + 角色管理 UI 设计文档

> 日期：2026-04-16
> 状态：已实现
> 范围：T2.3 角色切换 UI + 角色配置管理界面

---

## 1. 概述

为 Lumen 添加角色管理功能，包含两个入口：

1. **侧边栏角色选择器**——在聊天页面快速切换当前会话的角色
2. **独立角色管理页面**——完整的角色 CRUD（创建/编辑/删除），含头像上传和工具选择

同时修复后端已知 bug 并扩展角色 CRUD API。

---

## 2. 功能范围

### 2.1 本次做

| 功能 | 入口 | 说明 |
|------|------|------|
| 角色快速切换 | 侧边栏 | 下拉选择角色，切换当前会话角色 |
| 角色列表 | 设置页 `/settings/characters` | 卡片式展示所有角色 |
| 创建角色 | 设置页 | 填写表单 + 上传头像 |
| 编辑角色 | 设置页 | 修改名字/描述/提示词/开场白/头像/工具 |
| 删除角色 | 设置页 | 确认后删除（不可删 default） |
| 头像上传 | 设置页 | 图片上传，存到 `lumen/characters/avatars/` |
| 工具选择 | 设置页 | 按钮式开关，控制角色可用工具 |
| 工具使用指南 | 设置页 | 可选文本框，写工具使用规则 |
| builder.py 增强 | 后端 | 自动组合 name/description 进提示词 |

### 2.2 本次不做

| 功能 | 原因 |
|------|------|
| 模型选择/参数（top_p、temperature） | 需要全局配置系统，与角色配置是不同职责 |
| 向量检索变量（`[[日记本]]`语法） | 需要向量数据库，长期规划 |
| 工具提示词自定义位置 | YAGNI——tool_instructions 字段足够灵活 |

---

## 3. 后端设计

### 3.1 修复已知 Bug

**`list_characters()` 返回顺序错误**

`lumen/prompt/character.py` 的 `list_characters()` 返回 `[(char_id, name)]`，但 `api/routes/character.py` 解构为 `for name, char_id in chars`，顺序反了。

修复：统一返回结构为 `list[dict]`，不再用元组。

### 3.2 CharacterCard 模型扩展

文件：`lumen/prompt/types.py`

```python
class CharacterCard(BaseModel):
    name: str
    system_prompt: str = ""
    description: Optional[str] = None
    greeting: Optional[str] = None
    tools: List[str] = []
    avatar: Optional[str] = None           # 新增：头像文件名
    tool_instructions: Optional[str] = None # 新增：工具使用指南
```

### 3.3 新增 API 端点

文件：`api/routes/character.py`

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/characters/create` | 创建角色（含头像上传） |
| `PUT` | `/characters/{character_id}` | 更新角色（含头像上传） |
| `DELETE` | `/characters/{character_id}` | 删除角色（禁止删 default） |
| `POST` | `/characters/upload-avatar` | 单独上传头像 |

**创建/更新逻辑**：
- 接收 `multipart/form-data`（表单字段 + 可选头像文件）
- 校验 character_id 格式（`^[a-zA-Z0-9_\-]+$`）
- 创建：写入 `lumen/characters/{id}.json`
- 更新：读取 → 合并字段 → 写回（不覆盖未提交的字段）
- 头像：保存到 `lumen/characters/avatars/{id}.{ext}`，JSON 里记录文件名

**删除逻辑**：
- 删除 JSON 文件 + 头像文件
- 禁止删除 `default` 角色
- 清理内存中对应的会话引用

### 3.4 builder.py 增强

文件：`lumen/prompt/builder.py`

改动：`build_system_prompt()` 自动组合角色元数据

```python
parts = []

# 自动组合 name 和 description（不再需要用户在 system_prompt 里重复）
if character.get("name"):
    parts.append(f"你的名字是{character['name']}。")
if character.get("description"):
    parts.append(f"角色设定：{character['description']}。")

# system_prompt 核心
if character.get("system_prompt"):
    parts.append(character["system_prompt"])

# 工具描述（从 registry.json 自动生成）
tools = character.get("tools", [])
if tools:
    tool_prompt = get_tool_prompt_from_registry(tools)
    if tool_prompt:
        parts.append(tool_prompt)
    has_tools = True

# 工具使用指南（用户自定义的工具使用规则）
if character.get("tool_instructions"):
    parts.append(f"【工具使用指南】\n{character['tool_instructions']}")

# 动态内容
if dynamic_context:
    for item in dynamic_context:
        if item.get("injection_point", "system") == "system":
            parts.append(item["content"])

# 角色保持指令
if has_tools and character.get("system_prompt"):
    parts.append("【角色保持】\n...")
```

### 3.5 头像静态文件服务

文件：`api/main.py`

添加静态文件挂载：`/avatars/` → `lumen/characters/avatars/`

---

## 4. 前端设计

### 4.1 路由系统

新增依赖：`react-router-dom`

使用 `HashRouter`（Tauri 桌面应用无后端服务器）：

```
/                      → 聊天页面（默认）
/settings/characters   → 角色管理页面
/settings/characters/new → 新建角色
/settings/characters/:id → 编辑角色
```

App.tsx 结构：
```tsx
<HashRouter>
  <Routes>
    <Route path="/" element={<ChatLayout />}>
      {/* 侧边栏 + 聊天面板 */}
    </Route>
    <Route path="/settings/characters" element={<CharacterList />}>
      <Route path="new" element={<CharacterEditor />} />
      <Route path=":id" element={<CharacterEditor />} />
    </Route>
  </Routes>
</HashRouter>
```

### 4.2 新增文件

```
src/
  api/
    character.ts         # 角色 CRUD API 调用
  hooks/
    useCharacters.ts     # 角色列表状态管理
  components/
    CharacterSelector.tsx  # 侧边栏角色选择器（下拉菜单）
  pages/
    CharacterList.tsx    # 角色管理列表页
    CharacterEditor.tsx  # 角色创建/编辑表单
  types/
    character.ts         # Character 类型定义
```

### 4.3 侧边栏角色选择器

位置：`ChatSidebar` 底部

行为：
- 显示当前角色头像 + 名字
- 点击展开下拉菜单，列出所有角色（头像 + 名字）
- 选择后调用 `/characters/switch` 切换当前会话角色
- 底部有「管理角色」按钮，跳转到 `/settings/characters`

### 4.4 角色管理列表页

布局：卡片网格，每张卡片展示头像 + 名字 + 描述 + 已启用工具数

操作：
- 点击卡片 → 进入编辑页
- 右上角「新建角色」按钮
- 卡片上有删除按钮（default 角色无删除按钮，用 hover tooltip 提示）

### 4.5 角色编辑器

表单字段：

| 字段 | 控件 | 说明 |
|------|------|------|
| 角色ID | 文本输入 | 仅新建时可填，创建后不可改 |
| 名字 | 文本输入 | 显示名 |
| 头像 | 图片上传/预览 | 拖拽或点击上传，预览圆形裁切 |
| 描述 | 单行文本 | 简短描述角色身份 |
| 系统提示词 | 多行文本框 | 大文本编辑区，支持 `{{变量}}` 语法 |
| 开场白 | 单行文本 | 新会话时 AI 的第一句话 |
| 可用工具 | 按钮式开关组 | 从 registry.json 读取工具列表，每个一个 toggle |
| 工具使用指南 | 多行文本框 | 可选，描述工具使用规则 |

### 4.6 API 客户端

文件：`src/api/character.ts`

```typescript
listCharacters(): Promise<Character[]>
getCharacter(id: string): Promise<Character>
createCharacter(data: FormData): Promise<Character>
updateCharacter(id: string, data: FormData): Promise<Character>
deleteCharacter(id: string): Promise<void>
switchCharacter(characterId: string, sessionId: string): Promise<SwitchResult>
```

---

## 5. 数据流

```
角色JSON文件 ←→ 后端CRUD API ←→ character.ts ←→ useCharacters hook
       ↑                                              ↓
  lumen/characters/                    ┌── CharacterSelector（侧边栏切换）
  lumen/characters/avatars/            └── CharacterList/Editor（管理页面）
```

---

## 6. 涉及的文件变动

### 后端修改

| 文件 | 变动 |
|------|------|
| `lumen/prompt/types.py` | CharacterCard 加 avatar、tool_instructions 字段 |
| `lumen/prompt/character.py` | 修复 list_characters 顺序 bug，加 create/update/delete |
| `lumen/prompt/builder.py` | 自动组合 name/description，注入 tool_instructions |
| `api/routes/character.py` | 新增 create/update/delete 端点，头像上传 |
| `api/main.py` | 挂载头像静态文件目录 |

### 前端新增

| 文件 | 说明 |
|------|------|
| `src/api/character.ts` | 角色 API 客户端 |
| `src/hooks/useCharacters.ts` | 角色状态管理 |
| `src/components/CharacterSelector.tsx` | 侧边栏角色选择器 |
| `src/pages/CharacterList.tsx` | 角色列表页 |
| `src/pages/CharacterEditor.tsx` | 角色编辑器 |
| `src/types/character.ts` | 角色类型定义 |

### 前端修改

| 文件 | 变动 |
|------|------|
| `src/App.tsx` | 加 HashRouter 和路由定义 |
| `src/components/ChatSidebar.tsx` | 底部加角色选择器 |
| `src/components/ChatInterface.tsx` | 传递角色相关 props |

---

## 7. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 角色存储格式 | JSON | 结构化、Pydantic校验、API天然支持 |
| 工具选择方式 | 按钮开关 + 工具使用指南文本框 | 兼顾简单性和灵活性 |
| 角色属性引用 | builder.py 自动组合，不需变量 | name/description 自动拼入提示词，无需 {{char_name}} |
| 路由方案 | react-router-dom HashRouter | Tauri 桌面应用标准方案，未来支持多窗口 |
| 头像方案 | 图片上传，存本地文件 | 真实头像，JSON 记录路径 |
| 页面布局 | 侧边栏快速切换 + 独立设置页 | 日常用侧边栏，认真配置用设置页 |
| 工具描述格式 | 每个工具的描述+参数+使用时机绑在一起 | 避免工具多时描述和使用规则距离过远导致AI注意力衰减 |
| 工具使用指南分层 | 单工具 usage_guide（registry.json）+ 跨工具 tool_instructions（角色配置） | 单工具的使用时机跟着工具走，跨工具协调规则跟着角色走 |
