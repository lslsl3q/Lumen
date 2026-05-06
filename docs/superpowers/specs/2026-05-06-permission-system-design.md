# Lumen 统一知识资源权限系统 设计文档

> 日期：2026-05-06
> 状态：设计中
> 优先级：P1（基础设施 — 所有检索消费方的前置）
> 来源：用户需求 + Claude 设计 + Gemini 评审

---

## 1. 背景与动机

Lumen 现有 5 种独立的权限/过滤机制分散在 6 个系统中：

| 现有机制 | 系统 | 形式 |
|---------|------|------|
| `character_ids` 列表 | 世界书 | `entry.character_ids: List[str]` |
| `accessible_knowledge` 列表 | 知识库 | 角色卡上的白名单 |
| `owner_id` + `access_list` | 日记 | `["public"]` 默认 |
| `enabled` 标志 | Skills / 写作设定 | 布尔开关 |
| 装备列表 `character.skills` | Skills | 角色卡上的技能 ID 列表 |

没有一个统一的"这个角色能不能访问这个资源"的判断入口。

---

## 2. 范围

### 纳入（进 TriviumDB 的）

| 资源类型 | resource_type | 读用例 | 写用例 |
|---------|--------------|--------|--------|
| 知识库 | `"knowledge"` | LoreComponent 检索注入 | 用户上传/管理 |
| 日记 | `"diary"` | 角色查阅自己日记 | Agent 写入日记 |
| 写作资源 | `"writing"` | 写作模式 AI 参考 | 用户创作 |

### 不纳入（已有独立机制，不动）

- **世界书** — `character_ids` 匹配关键词，不依赖 TDB
- **Skills** — 装备列表 + `enabled` 标志，Markdown 文件存储
- **语义组** — 全局搜索增强工具，非权限控制

### 权限粒度

**知识库 + 文件夹两级**。支持父文件夹勾选 → 子文件夹继承，子文件夹勾选 → 父文件夹半勾。

---

## 3. 数据模型

### 3.1 ACL 表

```sql
CREATE TABLE acl_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,     -- "knowledge" | "diary" | "writing"
    resource_id TEXT NOT NULL,       -- TDB 名称，如 "knowledge"
    folder_path TEXT DEFAULT '',     -- 空 = 根目录；"/几何" = 子文件夹
    action TEXT NOT NULL             -- "read" | "write"
);
CREATE UNIQUE INDEX idx_acl_unique ON acl_rules(
    character_id, resource_type, resource_id, folder_path, action
);
```

**没有 `access` 字段（allow/deny）。** 判断逻辑就一条：

> 记录在表中 = 有权限。不在表中 = 用资源类型默认值。

### 3.2 默认值

| resource_type | read 默认 | write 默认 |
|--------------|----------|-----------|
| `"knowledge"` | 所有角色允许 | 所有角色拒绝 |
| `"diary"` | 只有创建者允许 | 只有创建者允许 |
| `"writing"` | 只有创建者允许 | 只有创建者允许 |

### 3.3 最长路径优先匹配

查询 `(角色A, knowledge, "knowledge", "/几何/三角")`：
1. 查精确 `/几何/三角` → 命中则返回
2. 查父级 `/几何` → 命中则返回
3. 查根 `""` → 命中则返回
4. 都没命中 → 资源类型默认值

### 3.4 树形继承（前端逻辑，后端只存叶子节点）

- 勾 `/几何` → 存 `/几何`，前端自动全勾子节点
- 取消 `/几何` → 删 `/几何` + 递归删所有子节点
- 勾 `/几何/三角` → 存 `/几何/三角`；`/几何` 前端显示为半勾（灰勾）

---

## 4. 后端服务

### 4.1 AccessControl 服务

**文件**：`lumen/services/access_control.py`

```python
class AccessControl:
    """统一权限服务 — 单例"""

    def can_read(self, character_id: str, resource_type: str,
                 resource_id: str, folder_path: str = "") -> bool

    def can_write(self, character_id: str, resource_type: str,
                  resource_id: str, folder_path: str = "") -> bool

    def get_permissions(self, character_id: str, resource_type: str,
                        resource_id: str) -> list[str]:
        """返回该角色在某知识库下所有被允许的文件夹路径列表"""

    def set_permission(self, character_id: str, resource_type: str,
                       resource_id: str, folder_path: str, action: str) -> None

    def remove_permission(self, character_id: str, resource_type: str,
                          resource_id: str, folder_path: str, action: str) -> None:
        """同时递归取消所有子文件夹"""

    def get_characters_with_access(self, resource_type: str,
                                   resource_id: str, folder_path: str,
                                   action: str) -> list[str]:
        """反查：按知识库视角获取有权限的角色列表"""

    def batch_set_permissions(self, resource_type: str, resource_id: str,
                              entries: list[dict]) -> None:
        """批量更新（前端一次提交所有变更）"""
```

### 4.2 REST API

**文件**：`api/routes/permissions.py`

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/permissions/character/{id}` | 角色视角：获取某类型下所有权限 |
| `GET` | `/permissions/resource/{type}/{id}` | 知识库视角：获取全部角色的权限 |
| `PUT` | `/permissions/character/{id}` | 批量更新角色权限 |
| `PUT` | `/permissions/resource/{type}/{id}` | 批量更新资源权限 |

### 4.3 检索管道接入

```
LoreComponent.pre_act(context)
  → AccessControl.get_permissions(character_id, "knowledge", "knowledge.tdb")
  → 得到 ["/地理", "/天文/太阳系", ...]
  → TriviumDB metadata filter: folder IN (...)
  → 检索
```

---

## 5. 前端 UI

### 5.1 独立权限管理页

从设置入口进入，双标签页面：

**按角色标签页：**
- 左侧：角色列表
- 右侧：完整知识库目录树（固定不变）
- 切换角色 → 树上的勾选状态跟着变
- 底部 [全选] / [反选] 按钮

**按知识库标签页：**
- 左侧：完整知识库目录树
- 点击某个文件夹/知识库
- 右侧：显示有权限的角色列表 + [✕ 移除]
- 顶部： [+ 添加角色] 下拉/弹窗

### 5.2 三态复选框

- 全勾：所有子节点都被选中
- 半勾（灰勾）：部分子节点被选中
- 不勾：没有任何子节点被选中

### 5.3 知识库名显示

直接使用 TDB 名称，不允许自定义别名。`knowledge.tdb` 显示为 "knowledge"。

---

## 6. Agent 写入机制

### 6.1 write_targets — 路径模板

角色配置中的 `write_targets` 字段定义 Agent 可以写入哪些文件夹：

```json
// character.json
{
  "write_targets": {
    "diary": "/日记/{character_id}",
    "knowledge": "/知识/{character_id}",
    "public_memory": "/公共记忆",
    "public_knowledge": "/公共知识"
  }
}
```

运行时 `{character_id}` 自动替换为角色 ID（如 "AgentA"）。

### 6.2 Agent 识别机制

IdentityComponent 将 `write_targets` 注入 system prompt：

> 你可以写入以下文件夹：
> - 日记 → `/日记/AgentA`
> - 知识 → `/知识/AgentA`
> - 公共记忆 → `/公共记忆`
> - 公共知识 → `/公共知识`

`daily_note` 工具接收 `target` 参数，Agent 根据 prompt 中的列表选择写入目标。

### 6.3 默认值与扩展

新建角色时自动填入 4 个默认目标。用户可在角色设置中增删改写入目标。

### 6.4 写入权限验证

工具执行写入时，AccessControl 检查 `write_targets` 中的路径是否在 ACL 表中。
角色配置里有 `write_targets` → ACL 表自动创建对应的 write 规则。

---

## 7. 实施路径

| Phase | 内容 | 改动量 |
|-------|------|--------|
| **Phase 1** | ACL 表 + AccessControl 服务 + REST API | 新增 ~300 行 |
| **Phase 2** | 前端权限管理页（双标签 + 树形勾选） | 新增组件 |
| **Phase 3** | 检索管道接入（LoreComponent / Writing / GM Agent） | 改 ~3 个文件 |
| **Phase 4** | Agent 写入目标（write_targets + IdentityComponent 注入 + daily_note 接入） | 改 ~2 个文件 |
