"""
Lumen - 工具注册系统
管理所有可用工具的定义和执行
"""

import json
from pathlib import Path


# ========================================
# 工具定义验证规则
# ========================================

def validate_tool_definition(name: str, definition: dict) -> tuple:
    """
    验证工具定义是否符合 JSON Schema 格式规范

    Args:
        name: 工具名称
        definition: 工具定义

    Returns:
        (is_valid, error_message)
    """
    errors = []

    # 检查必需字段
    if "description" not in definition:
        errors.append("缺少 description 字段")
    elif not isinstance(definition["description"], str):
        errors.append("description 必须是字符串")

    if "parameters" not in definition:
        errors.append("缺少 parameters 字段")
    elif not isinstance(definition["parameters"], dict):
        errors.append("parameters 必须是对象")
    else:
        params = definition["parameters"]

        if "type" not in params:
            errors.append("parameters 缺少 type 字段")
        elif params["type"] != "object":
            errors.append(f"parameters.type 必须是 'object'，当前是 '{params['type']}'")

        if "properties" not in params:
            errors.append("parameters 缺少 properties 字段")
        elif not isinstance(params["properties"], dict):
            errors.append("parameters.properties 必须是对象")
        else:
            for param_name, param_def in params["properties"].items():
                if not isinstance(param_def, dict):
                    errors.append(f"参数 '{param_name}' 的定义必须是对象")
                    continue

                if "type" not in param_def:
                    errors.append(f"参数 '{param_name}' 缺少 type 字段")
                elif param_def["type"] not in ["string", "number", "integer", "boolean", "array", "object"]:
                    errors.append(f"参数 '{param_name}' 的 type '{param_def['type']}' 无效")

                if "enum" in param_def:
                    if not isinstance(param_def["enum"], list):
                        errors.append(f"参数 '{param_name}' 的 enum 必须是数组")

        if "required" in params:
            if not isinstance(params["required"], list):
                errors.append("parameters.required 必须是数组")
            else:
                for req in params["required"]:
                    if not isinstance(req, str):
                        errors.append(f"required 中的项必须是字符串，发现: {type(req)}")
                    elif "properties" in params and req not in params["properties"]:
                        errors.append(f"required 中引用了不存在的参数: {req}")

    is_valid = len(errors) == 0
    error_msg = "; ".join(errors) if errors else None

    return is_valid, error_msg


class ToolRegistry:
    """工具注册表 - 管理所有工具的定义"""

    def __init__(self, registry_path: str = None):
        """初始化工具注册表

        Args:
            registry_path: 工具注册表 JSON 文件路径
        """
        if registry_path is None:
            # 默认路径：和本文件同目录的 registry.json
            registry_path = Path(__file__).parent / "registry.json"

        self.registry_path = Path(registry_path)
        self.tools = {}
        self._load()

    def _load(self):
        """从 JSON 文件加载工具定义"""
        if not self.registry_path.exists():
            print(f"[ToolRegistry] 警告: 工具注册表不存在: {self.registry_path}")
            return

        try:
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            valid_tools = {}
            for name, definition in data.items():
                is_valid, error = validate_tool_definition(name, definition)
                if is_valid:
                    valid_tools[name] = definition
                else:
                    print(f"[ToolRegistry] ❌ 工具 '{name}' 验证失败: {error}")

            self.tools = valid_tools
            print(f"[ToolRegistry] ✅ 已加载 {len(self.tools)} 个工具（共 {len(data)} 个）")
        except Exception as e:
            print(f"[ToolRegistry] 加载失败: {e}")

    def save(self):
        """保存工具定义到 JSON 文件"""
        try:
            with open(self.registry_path, 'w', encoding='utf-8') as f:
                json.dump(self.tools, f, ensure_ascii=False, indent=2)
            print(f"[ToolRegistry] 已保存 {len(self.tools)} 个工具")
        except Exception as e:
            print(f"[ToolRegistry] 保存失败: {e}")

    def register(self, name: str, definition: dict):
        """注册一个新工具（会先验证定义）"""
        is_valid, error = validate_tool_definition(name, definition)
        if not is_valid:
            print(f"[ToolRegistry] ❌ 工具 '{name}' 验证失败: {error}")
            return False

        self.tools[name] = definition
        print(f"[ToolRegistry] ✅ 已注册工具: {name}")
        return True

    def unregister(self, name: str):
        """注销工具"""
        if name in self.tools:
            del self.tools[name]
            print(f"[ToolRegistry] 已注销工具: {name}")

    def get_tool(self, name: str) -> dict:
        """获取单个工具定义"""
        return self.tools.get(name)

    def get_tools(self, names: list = None) -> dict:
        """获取工具定义

        Args:
            names: 工具名称列表，如果为 None 则返回所有工具

        Returns:
            工具定义字典 {name: definition}
        """
        if names is None:
            return self.tools.copy()

        result = {}
        for name in names:
            if name in self.tools:
                result[name] = self.tools[name]
            else:
                print(f"[ToolRegistry] 警告: 工具不存在: {name}")
        return result

    def list_tools(self) -> list:
        """列出所有工具名称"""
        return list(self.tools.keys())

    def exists(self, name: str) -> bool:
        """检查工具是否存在"""
        return name in self.tools


# 全局单例
_registry_instance = None


def get_registry() -> ToolRegistry:
    """获取全局工具注册表单例"""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = ToolRegistry()
    return _registry_instance
