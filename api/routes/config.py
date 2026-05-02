"""
统一配置管理 API
前端通过这一个路由管理所有可编辑的资源：环境配置、工具定义、角色卡片
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
import os

router = APIRouter()

# ========================================
# 数据路径定义
# ========================================

# 项目根目录
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

# 可管理的资源类型
_RESOURCE_FILES = {
    "env": os.path.join(_PROJECT_ROOT, ".env"),
    "tools": os.path.join(_PROJECT_ROOT, "lumen", "tools", "registry.json"),
    "workspaces": os.path.join(_PROJECT_ROOT, "lumen", "data", "file_workspaces.json"),
}


# ========================================
# 请求/响应模型
# ========================================

class ConfigUpdateRequest(BaseModel):
    """配置更新请求"""
    content: str  # 新的配置内容（文本或JSON字符串）


class ConfigItem(BaseModel):
    """配置项信息"""
    name: str
    description: str
    type: str  # "json" | "env" | "text"
    editable: bool


# ========================================
# 资源描述（前端用来渲染配置面板）
# ========================================

_RESOURCE_INFO = {
    "env": ConfigItem(
        name="env",
        description="环境配置（API地址、密钥、模型等）",
        type="env",
        editable=True,
    ),
    "tools": ConfigItem(
        name="tools",
        description="工具注册表（工具定义和参数 Schema）",
        type="json",
        editable=True,
    ),
    "workspaces": ConfigItem(
        name="workspaces",
        description="文件工作区配置（允许 AI 访问的目录、只读模式等）",
        type="json",
        editable=True,
    ),
}


# ========================================
# API 端点
# ========================================

@router.get("/list", response_model=List[ConfigItem])
async def list_configs():
    """列出所有可管理的配置项

    前端用这个接口渲染配置面板的标签页/列表
    """
    return list(_RESOURCE_INFO.values())


# ── 具体路由必须在 /{resource} 之前注册，否则会被通配路由抢先匹配 ──


# ========================================
# TDB 列表（编辑器用）
# ========================================

@router.get("/tdbs")
async def list_tdbs():
    """列出用户可见的 TDB 文件（动态，前端标签页用）"""
    data_dir = os.path.join(_PROJECT_ROOT, "lumen", "data")

    # 排除的内部 TDB
    _INTERNAL = {"knowledge_sentences.tdb", "thinking_clusters.tdb"}

    tdbs = []
    # 扫描 data/ 及子目录（vectors/api/, vectors/local/）
    for root, dirs, files in os.walk(data_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in sorted(files):
            if not f.endswith(".tdb"):
                continue
            if f in _INTERNAL:
                continue

            name = f.replace(".tdb", "")
            path = os.path.join(root, f)
            size = os.path.getsize(path)

            tdbs.append({
                "name": name,
                "filename": f,
                "size": size,
            })

    # 兜底：核心 TDB 即使文件未创建也要显示
    _ALWAYS_SHOW = ["knowledge", "memory"]
    existing_names = {t["name"] for t in tdbs}
    for name in _ALWAYS_SHOW:
        if name not in existing_names:
            tdbs.append({"name": name, "filename": None, "size": 0})

    return {"tdbs": tdbs}


# ── 通配路由（必须放最后） ──


@router.get("/{resource}")
async def get_config(resource: str):
    """获取某个配置项的内容"""
    if resource not in _RESOURCE_FILES:
        raise HTTPException(
            status_code=404,
            detail=f"未知配置项: {resource}，可用项: {list(_RESOURCE_FILES.keys())}"
        )

    filepath = _RESOURCE_FILES[resource]

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"配置文件不存在: {resource}")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        parsed = None
        info = _RESOURCE_INFO.get(resource)
        if info and info.type == "json":
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                parsed = None

        result = {
            "name": resource,
            "type": info.type if info else "text",
            "content": content,
        }
        if parsed is not None:
            result["parsed"] = parsed

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取配置失败: {str(e)}")


@router.post("/{resource}")
async def update_config(resource: str, req: ConfigUpdateRequest):
    """更新某个配置项"""
    if resource not in _RESOURCE_FILES:
        raise HTTPException(
            status_code=404,
            detail=f"未知配置项: {resource}，可用项: {list(_RESOURCE_FILES.keys())}"
        )

    info = _RESOURCE_INFO.get(resource)
    if info and not info.editable:
        raise HTTPException(status_code=403, detail=f"配置项 {resource} 不可编辑")

    if info and info.type == "json":
        try:
            json.loads(req.content)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400,
                detail=f"JSON 格式错误: {str(e)}"
            )

    filepath = _RESOURCE_FILES[resource]

    # ── 嵌入模型变更检测（.env 保存时）──
    rebuild_warning = None
    if resource == "env":
        # 解析新旧 .env 中的嵌入相关键
        def _parse_env(text: str) -> dict:
            result = {}
            for line in text.split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    result[k.strip()] = v.strip()
            return result

        old_env = {}
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                old_env = _parse_env(f.read())
        new_env = _parse_env(req.content)

        EMBED_KEYS = [
            "EMBEDDING_MODEL",
            "EMBEDDING_LOCAL_MODEL",
            "EMBEDDING_API_MODEL",
            "KNOWLEDGE_EMBEDDING_API_MODEL",
        ]
        changed = [k for k in EMBED_KEYS
                   if old_env.get(k) != new_env.get(k)]

        if changed:
            rebuild_warning = (
                f"嵌入模型配置已变更（{', '.join(changed)}）。"
                "向量维度可能不匹配，请重启后端后重新导入知识库文件以重建向量。"
            )

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(req.content)

        result = {"message": f"已更新配置: {resource}"}
        if rebuild_warning:
            result["rebuild_warning"] = rebuild_warning
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}")


# ========================================
# 图谱抽取提示词
# ========================================

@router.get("/graph-prompt")
async def get_graph_prompt():
    """读取图谱抽取提示词文件"""
    from lumen.prompt.graph_extract import get_prompt_file_path, load_prompts

    filepath = get_prompt_file_path()
    system_prompt, user_template = load_prompts()

    # 尝试读取原始文件内容
    raw_content = ""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            raw_content = f.read()
    except Exception:
        pass

    return {
        "system_prompt": system_prompt,
        "user_template": user_template,
        "file_path": filepath,
        "raw_content": raw_content,
    }


class GraphPromptUpdate(BaseModel):
    content: str


@router.put("/graph-prompt")
async def update_graph_prompt(req: GraphPromptUpdate):
    """更新图谱抽取提示词文件（直接写 markdown 文件）"""
    from lumen.prompt.graph_extract import get_prompt_file_path, _parse_prompt_file

    filepath = get_prompt_file_path()

    # 验证内容可以解析
    system_prompt, user_template = _parse_prompt_file(req.content)
    if not system_prompt or not user_template:
        raise HTTPException(400, "提示词格式错误：需要包含 '## 系统提示词' 和 '## 用户提示词模板' 两个段落")

    # 用户提示词模板必须包含 {content} 占位符
    if "{content}" not in user_template:
        raise HTTPException(400, "用户提示词模板必须包含 {content} 占位符")

    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"message": "图谱提示词已更新，下次抽取时生效"}
    except Exception as e:
        raise HTTPException(500, f"保存提示词失败: {str(e)}")
