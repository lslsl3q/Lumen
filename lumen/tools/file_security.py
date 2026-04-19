"""
Lumen - 文件操作安全层
所有文件操作必须经过此模块验证路径安全性

三层防护：
1. 系统黑名单 → 硬拒绝（Windows系统目录、.ssh等）
2. 工作区白名单 → 自由访问
3. 工作区外非敏感 → 拒绝，提示添加工作区
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, TypedDict


class PathValidationResult(TypedDict):
    """路径验证结果 — file_security → file_read/file_write 内部传递"""
    allowed: bool
    real_path: str
    reason: Optional[str]

logger = logging.getLogger(__name__)


# ========================================
# 系统黑名单 — 这些目录永远不可访问
# ========================================

def _build_blacklist() -> List[str]:
    """构建系统敏感目录黑名单（全部转为小写，便于比较）"""
    blacklist = []

    # Windows 系统目录
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    blacklist.append(os.path.normpath(system_root).lower())

    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    blacklist.append(os.path.normpath(program_files).lower())

    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    blacklist.append(os.path.normpath(program_files_x86).lower())

    program_data = os.environ.get("ProgramData", r"C:\ProgramData")
    blacklist.append(os.path.normpath(program_data).lower())

    # 用户敏感目录
    home = Path.home()
    blacklist.append(str(home / ".ssh").lower())
    blacklist.append(str(home / ".gnupg").lower())

    return blacklist


_SYSTEM_BLACKLIST = _build_blacklist()

# 敏感文件名（不管在哪个目录都禁止）
_SENSITIVE_FILENAMES = {".env", "credentials.json", "id_rsa", "id_ed25519"}

# Windows 保留设备名（访问会导致系统异常）
_WINDOWS_DEVICE_NAMES = {
    "con", "prn", "aux", "nul",
    "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
    "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
}


# ========================================
# 工作区管理
# ========================================

def _get_workspaces_path() -> Path:
    """获取工作区配置文件路径"""
    return Path(__file__).parent.parent / "data" / "file_workspaces.json"


def load_workspaces() -> Dict:
    """加载工作区配置

    Returns:
        {"workspaces": [...], "readonly_mode": bool, "max_file_size_mb": int}
    """
    config_path = _get_workspaces_path()

    if not config_path.exists():
        # 默认配置：空工作区列表
        default = {
            "workspaces": [],
            "readonly_mode": False,
            "max_file_size_mb": 10,
        }
        # 自动创建默认配置文件
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")
        return default

    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"工作区配置文件读取失败: {e}，使用默认配置")
        return {"workspaces": [], "readonly_mode": False, "max_file_size_mb": 10}


def save_workspaces(config: Dict) -> None:
    """保存工作区配置"""
    config_path = _get_workspaces_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")


def get_workspace_dirs() -> List[str]:
    """获取工作区目录列表（已标准化为小写，去掉尾部斜杠）"""
    config = load_workspaces()
    return [os.path.normpath(w).lower().rstrip(os.sep) for w in config.get("workspaces", [])]


def is_readonly_mode() -> bool:
    """是否处于只读模式"""
    config = load_workspaces()
    return config.get("readonly_mode", False)


def get_max_file_size_mb() -> int:
    """获取单文件最大大小（MB）"""
    config = load_workspaces()
    return config.get("max_file_size_mb", 10)


# ========================================
# 路径验证
# ========================================

def resolve_path(path: str) -> str:
    """解析真实路径

    - 转换为绝对路径
    - 解析 ../ 穿越
    - 解析符号链接
    - 统一分隔符
    """
    return os.path.normpath(os.path.realpath(path))


def is_in_blacklist(real_path: str) -> bool:
    """检查路径是否在系统黑名单内"""
    path_lower = real_path.lower()

    for blacklisted in _SYSTEM_BLACKLIST:
        # 路径在黑名单目录内（是子目录或本身）
        if path_lower == blacklisted or path_lower.startswith(blacklisted + os.sep):
            return True

    return False


def is_sensitive_filename(path: str) -> bool:
    """检查文件名是否敏感（.env、密钥文件、Windows 设备名等）"""
    filename = os.path.basename(path).lower()
    # 去掉扩展名后再检查设备名（con.txt → con）
    stem = os.path.splitext(filename)[0]
    return filename in _SENSITIVE_FILENAMES or stem in _WINDOWS_DEVICE_NAMES


def is_in_workspace(real_path: str) -> bool:
    """检查路径是否在工作区内"""
    path_lower = real_path.lower()
    workspace_dirs = get_workspace_dirs()

    for workspace in workspace_dirs:
        # 路径在工作区目录内（是子文件/子目录或本身）
        if path_lower == workspace or path_lower.startswith(workspace + os.sep):
            return True

    return False


def validate_path(path: str, require_write: bool = False) -> PathValidationResult:
    """验证路径是否安全可访问

    Args:
        path: 待验证的路径
        require_write: 是否需要写入权限

    Returns:
        {
            "allowed": bool,
            "real_path": str,      # 解析后的真实路径
            "reason": str | None,  # 拒绝原因
        }
    """
    # 1. 拒绝 UNC 路径（\\server\share）
    if len(path) >= 2 and path[0:2] == "\\\\":
        return {
            "allowed": False,
            "real_path": path,
            "reason": "UNC 路径禁止访问",
        }

    # 2. 解析真实路径
    try:
        real_path = resolve_path(path)
    except Exception as e:
        return {
            "allowed": False,
            "real_path": path,
            "reason": f"路径解析失败: {e}",
        }

    # 3. 符号链接防护：解析后的真实路径也必须通过黑名单检查
    #     （防止工作区内创建指向系统目录的符号链接）
    if real_path != os.path.normpath(os.path.abspath(path)):
        if is_in_blacklist(real_path):
            return {
                "allowed": False,
                "real_path": real_path,
                "reason": f"符号链接指向系统敏感目录，禁止访问: {real_path}",
            }

    # 4. 检查系统黑名单
    if is_in_blacklist(real_path):
        return {
            "allowed": False,
            "real_path": real_path,
            "reason": f"系统敏感目录，禁止访问: {real_path}",
        }

    # 5. 检查敏感文件名
    if is_sensitive_filename(real_path):
        return {
            "allowed": False,
            "real_path": real_path,
            "reason": f"敏感文件，禁止访问: {os.path.basename(real_path)}",
        }

    # 6. 检查工作区白名单
    if is_in_workspace(real_path):
        if require_write and is_readonly_mode():
            return {
                "allowed": False,
                "real_path": real_path,
                "reason": "当前为只读模式，禁止写入操作",
            }
        return {
            "allowed": True,
            "real_path": real_path,
            "reason": None,
        }

    # 7. 不在工作区内 — 拒绝并提示
    workspace_dirs = get_workspace_dirs()
    if workspace_dirs:
        dirs_hint = "、".join(workspace_dirs)
        reason = (
            f"路径 '{real_path}' 不在工作区允许范围内。"
            f"\n当前工作区目录：{dirs_hint}"
            f"\n请在 lumen/data/file_workspaces.json 中添加该目录。"
        )
    else:
        reason = (
            f"路径 '{real_path}' 不在工作区允许范围内。"
            f"\n当前未配置任何工作区目录。"
            f"\n请在 lumen/data/file_workspaces.json 中添加工作区目录。"
        )

    return {
        "allowed": False,
        "real_path": real_path,
        "reason": reason,
    }
